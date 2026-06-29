import { Controller, Post, Get, Delete, Req, Res, Body } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpServerFactory } from './mcp-server.factory';
import { AuthUser } from './mcp.service';

interface StreamableSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  user: AuthUser;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

/**
 * Write a JSON error response using raw Node methods so it works under both
 * Express-augmented responses (production) and plain ServerResponse (tests).
 */
function sendJsonError(res: Response, status: number, message: string): void {
  (res as any).statusCode = status;
  (res as any).setHeader?.('content-type', 'application/json');
  (res as any).end(JSON.stringify({ error: message }));
}

/**
 * MCP Streamable HTTP transport (2025-03-26 spec).
 *
 * - POST   /api/mcp   send requests/notifications/responses; initialize creates a session
 * - GET    /api/mcp   open SSE stream for server→client notifications
 * - DELETE /api/mcp   end session
 *
 * All routes are behind the global AuthGuard; req.user is set before the handler runs.
 * The authenticated user is captured at session creation and threaded into tool calls.
 */
@Controller()
export class McpTransportController {
  private sessions = new Map<string, StreamableSession>();

  constructor(private factory: McpServerFactory) {}

  @Post('api/mcp')
  async handlePost(@Req() req: Request, @Res() res: Response, @Body() body: any) {
    if (!this.validateOrigin(req, res)) return;

    const user = (req as any).user as AuthUser | undefined;
    if (!user) {
      sendJsonError(res, 401, 'Unauthorized');
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const isInitialize = body?.method === 'initialize';

    if (isInitialize) {
      if (sessionId) {
        sendJsonError(res, 400, 'Initialize must not include Mcp-Session-Id');
        return;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      const server = this.factory.create(user);
      await server.connect(transport);

      // The SDK assigns the session id during handleRequest and writes it to the
      // response via writeHead. We intercept writeHead to capture the id and store
      // the session synchronously, before the response is flushed to the client.
      const origWriteHead = (res as any).writeHead?.bind(res);
      if (origWriteHead) {
        (res as any).writeHead = (code: number, headers?: Record<string, string>) => {
          const sid = headers?.['mcp-session-id'] ?? headers?.['Mcp-Session-Id'];
          if (sid) this.sessions.set(sid, { transport, server, user });
          return origWriteHead(code, headers);
        };
      }

      await transport.handleRequest(req as any, res as any, body);
      return;
    }

    if (!sessionId) {
      sendJsonError(res, 400, 'Mcp-Session-Id required');
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      sendJsonError(res, 404, 'Session not found');
      return;
    }
    await session.transport.handleRequest(req as any, res as any, body);
  }

  @Get('api/mcp')
  async handleGet(@Req() req: Request, @Res() res: Response) {
    if (!this.validateOrigin(req, res)) return;

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      sendJsonError(res, 400, 'Mcp-Session-Id required');
      return;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      sendJsonError(res, 404, 'Session not found');
      return;
    }
    await session.transport.handleRequest(req as any, res as any);
  }

  @Delete('api/mcp')
  async handleDelete(@Req() req: Request, @Res() res: Response) {
    if (!this.validateOrigin(req, res)) return;

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      sendJsonError(res, 400, 'Mcp-Session-Id required');
      return;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      sendJsonError(res, 404, 'Session not found');
      return;
    }
    await session.transport.close();
    this.sessions.delete(sessionId);
    (res as any).statusCode = 204;
    (res as any).end();
  }

  /**
   * DNS-rebinding protection per the Streamable HTTP spec. Requests without an
   * Origin header (non-browser clients like opencode/Codex CLI) are allowed.
   * Browser clients must match MCP_ALLOWED_ORIGINS (defaults to localhost).
   */
  private validateOrigin(req: Request, res: Response): boolean {
    if (process.env.MCP_REQUIRE_ORIGIN === '0') return true;
    const origin = req.headers.origin;
    if (!origin) return true;
    const allowed = (process.env.MCP_ALLOWED_ORIGINS?.split(',').map(s => s.trim()) ?? DEFAULT_ALLOWED_ORIGINS);
    if (!allowed.includes(origin)) {
      sendJsonError(res, 403, 'Origin not allowed');
      return false;
    }
    return true;
  }
}