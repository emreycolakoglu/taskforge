# MCP Transport — Design Spec

**Date:** 2026-06-29
**Status:** Draft, awaiting user review
**Scope:** Replace taskforge's hand-rolled JSON-RPC POST endpoint with a spec-compliant MCP server using `@modelcontextprotocol/sdk`, using the current Streamable HTTP transport (2025-03-26 spec) that all major MCP clients (opencode, Claude Desktop, Claude Code, Codex CLI) support.

## Problem

taskforge's `/api/mcp` is not a real MCP server. It is a single `POST /api/mcp` route that accepts a custom JSON-RPC shape (`{method: "boards_create", params, id}`) and returns a JSON response. Standard MCP clients (Claude Desktop, Claude Code, Codex CLI, opencode) cannot connect:

- They `GET /api/mcp` to open an SSE stream — no route exists → 404.
- They `POST` an `initialize` request and expect `Mcp-Session-Id` — no session management exists.
- They expect `tools/list` and `tools/call` JSON-RPC methods — taskforge only understands `resource_action` methods.

The error that prompted this work:

```
✗ taskforge failed
  SSE error: Non-200 status code (404)
  http://localhost:4321/api/mcp
```

## Non-Goals

- No changes to auth. taskforge already has a global `AuthGuard` (Bearer token against `Session` table, `auth.guard.ts`), bot token issuance (`auth.service.ts:179`), and actor attribution in `McpService` (`actorInfo`). The agent presents its bot token in `Authorization: Bearer <token>`; the guard authenticates and sets `req.user`; the MCP layer reads `req.user` and threads it into tool handlers. Zero auth code changes.
- No schema changes. The existing `Session`, `User`, `Bot` token model is sufficient.
- No SPA changes. The SPA continues to use session cookies / its existing auth; MCP and REST are the authed surfaces.
- No `AGENTS.md` "No authentication" correction — that stale line is a separate doc-only commit, not bundled here.
- No resources or prompts in the MCP server. taskforge has none today; YAGNI.
- No legacy HTTP+SSE transport. The deprecated 2024-11-05 transport is dropped; all current major MCP clients support Streamable HTTP.
- No tool input schema refinement beyond what `zod` gives for free. Schemas start permissive and are tightened later if clients reject them.

## Existing System (relevant parts)

### `apps/api/src/mcp/`
- `mcp.controller.ts` — `@Controller('api/mcp')` with `@Post()` and `@Post('jsonrpc')`, both calling `mcp.handleRequest(body, user)`. Reads `req.user` set by `AuthGuard`.
- `mcp.service.ts` — `handleRequest(req: McpRequest, user?: AuthUser): Promise<McpResponse>`. Splits `req.method` on `_` into `[resource, action]` and dispatches to `handleBoards/handleLists/handleTasks/handleComments/handleLabels/handleActivity/handleRelations`. Returns `{jsonrpc: '2.0', id, result}` or `{jsonrpc: '2.0', id, error: {code, message}}`. Already attributes actions via `actorInfo(user)` → `actorId`/`actor` on `Activity` and `Comment`.
- `mcp.service.spec.ts` — integration tests using `createTestPrisma()`, covering the `resource_action` surface.
- `mcp.module.ts` — imports nothing special; just declares controller + service.

### `apps/api/src/auth/`
- `auth.guard.ts` — global guard (`APP_GUARD` in `auth.module.ts`). Validates `Authorization: Bearer <token>` against `prisma.session.findUnique`, checks expiry/revocation, sets `request.user` (User without `passwordHash`) and `request.session`. `@Public()` decorator opts out.
- `auth.service.ts:179 createBotToken(adminId)` — issues a 365-day `Session` with `bot: true`, tied to the admin user. `POST /api/auth/bot-token` (admin-only) returns `{id, token, expiresAt}`.
- Bot token = a `Session` row. The guard treats it identically to a human session. `req.user` is the user the bot acts on behalf of.

### `apps/api/src/main.ts`
- CORS enabled (`origin: '*'` by default). The Streamable HTTP spec requires `Origin` header validation for DNS-rebinding protection; this is handled in the new controller (see Security).
- SPA fallback middleware skips `/api` and `/ws` paths; new MCP routes under `/api/mcp` bypass the fallback already. No `main.ts` change needed.

### Tool surface (existing `resource_action` methods)
Extracted from `mcp.service.ts`. Each becomes one MCP tool:

| Resource   | Actions                                     |
| ---------- | ------------------------------------------- |
| boards     | list, get, create, delete                    |
| lists      | list, create, update, delete                 |
| tasks      | list, get, search, create, update, move, delete |
| comments   | list, create                                 |
| labels     | list, create, delete                         |
| activity   | list                                         |
| relations  | list, create, delete                         |

Total: 24 tools. Tool names map 1:1 to existing `method` strings (`boards_create` → tool name `boards_create`).

## Design

### Architecture

```
Client (opencode / Claude Desktop / Codex / Claude Code)
  │
  │  Authorization: Bearer <bot-token>     ← validated by AuthGuard (unchanged)
  │  Mcp-Session-Id: <uuid>                 ← managed by SDK transport
  │
  ▼
NestJS global AuthGuard
  │  sets req.user
  ▼
McpTransportController  (new — replaces McpController)
  │  POST   /api/mcp   → StreamableHTTPServerTransport
  │  GET    /api/mcp   → StreamableHTTPServerTransport (SSE stream)
  │  DELETE /api/mcp   → StreamableHTTPServerTransport (session end)
  │
  ▼
McpServer (from @modelcontextprotocol/sdk, built by McpServerFactory)
  │  tools/call → registered tool handlers
  │
  ▼
McpService.handleRequest({method, params, id}, user)   ← unchanged
  │
  ▼
Prisma + EventsService (unchanged)
```

One transport type, one session store. Streamable HTTP is the only transport.

### Components

#### 1. `McpTransportController` (new file: `apps/api/src/mcp/mcp-transport.controller.ts`)

Replaces `McpController`. All routes are authed (no `@Public()` — the global `AuthGuard` already protects them, and `req.user` is populated before the handler runs).

**Stateful session store** (in-memory `Map` on the controller instance):
- `streamableSessions: Map<string, { transport: StreamableHTTPServerTransport; server: McpServer; user: AuthUser }>`

Single-process app, no horizontal scaling, no auth-relevant state in the session beyond caching the authenticated `user` — acceptable. Process restart drops sessions; clients reconnect and re-`initialize`.

**Streamable HTTP routes** (`/api/mcp`):

- `@Post('api/mcp')` `handlePost(@Req() req, @Res() res, @Body() body)`:
  - Read `Mcp-Session-Id` header from `req`.
  - If absent and body is `initialize`: create `StreamableHTTPServerTransport({sessionIdGenerator: () => randomUUID()})`, create `McpServer` via `McpServerFactory.create(req.user)`, `await server.connect(transport)`, store in `streamableSessions` by `transport.sessionId`, call `transport.handleRequest(req, res, body)`. The SDK sets the `Mcp-Session-Id` response header.
  - If present: look up session. If missing → respond `404` (per spec). If found → `transport.handleRequest(req, res, body)`.
  - If absent and body is not `initialize`: respond `400` (per spec).
- `@Get('api/mcp')` `handleGet(@Req() req, @Res() res)`:
  - Read `Mcp-Session-Id`. If absent or unknown session → `400`/`404` respectively (spec). Else `transport.handleRequest(req, res)`. The SDK writes the SSE stream.
- `@Delete('api/mcp')` `handleDelete(@Req() req, @Res() res)`:
  - Look up session, close transport + server, delete from map, respond per SDK.

**Origin validation**: The Streamable HTTP spec requires `Origin` header validation to prevent DNS rebinding. The SDK's `StreamableHTTPServerTransport` does not enforce this by default. We add a lightweight guard in the controller: if `process.env.MCP_REQUIRE_ORIGIN !== '0'` and the request has an `Origin` header, it must match `process.env.MCP_ALLOWED_ORIGINS` (comma-separated, default `http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173`). Requests without an `Origin` header (e.g. non-browser MCP clients like opencode/Codex CLI) are allowed through. This keeps local tooling working while protecting the browser-rebinding attack vector.

#### 2. `McpServerFactory` (new file: `apps/api/src/mcp/mcp-server.factory.ts`)

```ts
@Injectable()
export class McpServerFactory {
  constructor(private mcpService: McpService) {}

  create(user: AuthUser): McpServer {
    const server = new McpServer(
      { name: 'taskforge', version: process.env.npm_package_version ?? '0.1.0' },
      { capabilities: { tools: {} } },
    );

    for (const def of TOOL_DEFINITIONS) {
      server.registerTool(def.name, {
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,   // ZodRawShape
      }, async (args) => {
        const response = await this.mcpService.handleRequest(
          { method: def.name, params: args, id: 'mcp' },
          user,
        );
        if (response.error) {
          return { content: [{ type: 'text', text: response.error.message }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(response.result) }] };
      });
    }

    return server;
  }
}
```

`TOOL_DEFINITIONS` lives in `apps/api/src/mcp/tool-definitions.ts`. Each entry: `{name, title, description, inputSchema}`. `inputSchema` is a `ZodRawShape` (object of zod fields) consumed by `registerTool`. Initial schemas are permissive — required fields only where omission would cause a DB error, optional otherwise. Examples:

- `boards_create`: `{ name: z.string(), slug: z.string(), identifier: z.string().optional(), description: z.string().optional() }`
- `tasks_create`: `{ listId: z.string(), title: z.string(), description: z.string().optional(), priority: z.enum(['low','medium','high','urgent']).optional(), assigneeId: z.string().optional(), dueDate: z.string().optional(), parentId: z.string().nullable().optional(), labelIds: z.array(z.string()).optional(), position: z.number().optional(), metadata: z.record(z.unknown()).optional() }`
- `boards_list`, `lists_list`, `labels_list`, `activity_list`: `{}` (no args) or with optional filters.

The factory injects `McpService` — no change to the service. One `McpServer` per session because the SDK's session state is per-transport; cheap to construct.

#### 3. `McpService` — unchanged

No edits. The SDK layer calls `handleRequest` with `{method: <toolName>, params, id}` exactly as the old controller did. The existing error wrapping (`-32601` method not found, `-32603` internal error) is preserved; the SDK layer translates to `isError: true` for tool errors.

#### 4. `McpModule` — minor edit

Swap `McpController` for `McpTransportController`. Add `McpServerFactory` to providers. Keep `McpService` and its tests untouched.

#### 5. `main.ts` — no change

All new MCP routes are under `/api/mcp`, which already bypasses the SPA fallback (`main.ts:26` checks `req.path.startsWith('/api')`). No `/sse` or `/messages` routes to add.

#### 6. `package.json` — new dependency

Add `@modelcontextprotocol/sdk` (pinned to `^1.29.0`) to `apps/api/dependencies`. The SDK ships CommonJS (`dist/cjs/`) which matches the API's CommonJS module resolution. Import paths use the `/server/mcp.js` and `/server/streamableHttp.js` subpaths.

### Data Flow

**Initialization (Streamable HTTP):**
1. Client `POST /api/mcp` with `Accept: application/json, text/event-stream`, body `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}`, `Authorization: Bearer <bot-token>`.
2. `AuthGuard` validates token, sets `req.user`.
3. `McpTransportController.handlePost` sees no `Mcp-Session-Id`, body method is `initialize`. Creates `StreamableHTTPServerTransport` + `McpServer` (with `req.user` captured). `server.connect(transport)`. Stores session. Calls `transport.handleRequest(req, res, body)`.
4. SDK responds `200` with `Mcp-Session-Id: <uuid>` header and `InitializeResult` body (negotiated protocol version, server info, capabilities).
5. Client sends `POST /api/mcp` `notifications/initialized` with the session id → `202 Accepted`.

**Tool call:**
1. Client `POST /api/mcp` `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"boards_create","arguments":{"name":"X","slug":"x"}}}` with `Mcp-Session-Id`.
2. `AuthGuard` validates token.
3. Controller looks up session, calls `transport.handleRequest(req, res, body)`.
4. SDK dispatches `tools/call` → registered handler → `mcpService.handleRequest({method: 'boards_create', params: args, id: 'mcp'}, user)` → Prisma create + `events.emit('board:created', ...)` → returns board.
5. Handler wraps result: `{content: [{type:'text', text: JSON.stringify(board)}]}`.
6. SDK sends `CallToolResult` to client (JSON or SSE depending on response size/streaming).

### Error Handling

- **Auth failure** (missing/invalid token): `AuthGuard` throws `UnauthorizedException` → Nest returns `401` with `{statusCode, message}`. Not a JSON-RPC body, but clients treat HTTP 401 as auth failure uniformly.
- **Unknown session (POST/GET/DELETE)**: Controller responds `404` (Streamable HTTP spec) or `400` (missing session id on non-initialize). SDK also enforces this internally for stateful mode.
- **Tool execution error**: `McpService.handleRequest` catches and returns `{error: {code: -32603, message}}`. The factory handler maps to `{content: [{type:'text', text: message}], isError: true}`. Clients surface tool errors to the agent.
- **Method not found**: `McpService` returns `-32601`. Same mapping.
- **Origin validation failure**: `403` with a plain message.
- **Transport close / client disconnect**: The SDK invokes the transport's `onclose` callback. The controller sets `transport.onclose = () => { streamableSessions.delete(sessionId); server.close(); }` so closed sessions are removed from the map immediately. No periodic sweep. If a client never sends DELETE and the connection drops, the OS-level socket close still triggers `onclose`.

### Testing

**`mcp-transport.controller.spec.ts`** (new) — integration tests using `createTestPrisma()` pattern from existing specs. Spin the controller with a real `McpService` against the test DB. AuthGuard is bypassed in tests by setting `req.user` directly (or via a test harness that issues a bot token through `AuthService`).

1. **Initialize**: `POST /api/mcp` `initialize` → assert `200`, `Mcp-Session-Id` header present, body has `protocolVersion`, `serverInfo.name === 'taskforge'`, `capabilities.tools` present.
2. **Initialized notification**: `POST` `notifications/initialized` with session id → `202`.
3. **tools/list**: `POST` `tools/list` with session id → `200`, `result.tools` is an array of 24 entries with expected names.
4. **tools/call create + list**: `tools/call boards_create {name, slug, identifier}` → `200`, result has board. Then `tools/call boards_list` → `200`, result contains the created board.
5. **Actor attribution**: After `tools/call tasks_create`, assert `prisma.activity.findFirst` shows `actorId === <bot user id>` and `actor === <displayName>`.
6. **Unknown session**: `POST /api/mcp` with random `Mcp-Session-Id` → `404`.
7. **Missing session on non-initialize**: `POST /api/mcp` `tools/list` without `Mcp-Session-Id` → `400`.
8. **DELETE session**: `DELETE /api/mcp` with session id → session removed; subsequent `POST` with that id → `404`.

**`mcp-server.factory.spec.ts`** (new) — unit test: `factory.create(user)` returns a `McpServer`; assert the registered tool names (via introspecting `_registeredTools` or by spinning a mock transport and calling `tools/list`) match the 24 expected names.

**`mcp.service.spec.ts`** — unchanged. The service is not edited; its existing tests still pass.

**`auth.guard` interaction** — covered implicitly by the transport spec's bot-token setup. No new guard tests.

## Security

- **Auth**: All MCP routes are behind the existing global `AuthGuard`. Bearer token required; the existing bot token flow is the intended credential for agents.
- **Origin validation**: See `McpTransportController` design above. Defaults protect localhost; `MCP_ALLOWED_ORIGINS` env var for non-default deployments. Browser clients without a matching origin are rejected; non-browser MCP clients (no `Origin` header) pass.
- **Session id generation**: `randomUUID()` (cryptographically random), per spec recommendation.
- **No new surface area**: All existing REST routes unchanged. The new routes are additive.

## Migration / Backward Compatibility

- The old `POST /api/mcp` and `POST /api/mcp/jsonrpc` routes that accepted the custom `{method: "resource_action"}` shape are **removed**. Any caller still using them breaks. taskforge is pre-1.0, single-deployment, local-only; no external consumers to coordinate with. The `mcp.service.spec.ts` tests that call `handleRequest` directly still pass (the service signature is unchanged).
- `mcp.controller.ts` is deleted; `mcp-transport.controller.ts` replaces it.
- `AGENTS.md` "No authentication" line is stale but corrected in a separate commit.

## Open Questions

None at design time. Tool input schemas are intentionally permissive; refinement is deferred to a follow-up if clients complain or if we want richer editor hints.

## File Manifest

| Path | Change |
| ---- | ------ |
| `apps/api/package.json` | Add `@modelcontextprotocol/sdk` dependency |
| `apps/api/src/mcp/mcp-transport.controller.ts` | **New** — replaces `mcp.controller.ts` |
| `apps/api/src/mcp/mcp-server.factory.ts` | **New** — builds `McpServer` with tool registration |
| `apps/api/src/mcp/tool-definitions.ts` | **New** — tool name/description/schema table |
| `apps/api/src/mcp/mcp.controller.ts` | **Delete** |
| `apps/api/src/mcp/mcp.module.ts` | Edit — swap controller, add factory provider |
| `apps/api/src/mcp/mcp.service.ts` | **No change** |
| `apps/api/src/mcp/mcp.service.spec.ts` | **No change** |
| `apps/api/src/mcp/mcp-transport.controller.spec.ts` | **New** — integration tests |
| `apps/api/src/mcp/mcp-server.factory.spec.ts` | **New** — unit test |
| `AGENTS.md` | **Not in this scope** — separate doc commit for stale auth line |