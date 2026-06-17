# TaskForge

**A lightweight task tracker built for humans and AI agents to collaborate on the same boards.**

TaskForge is a full-stack task management application with three interfaces — REST API, MCP Server (for AI agents), and a Kanban SPA — all running in a single NestJS backend. It's designed so that any MCP-compatible agent (Claude Code, Hermes, Cursor, etc.) can do everything a human can: create boards, move tasks, assign work, comment, search, and more.

---

## Features

- **Kanban Board** — Drag-and-drop columns with Backlog → To Do → In Progress → Review → Done
- **List View** — Table view for quick scanning across all lists
- **Task Detail** — Edit title, description, priority, assignee, due date, labels
- **Comments** — Threaded discussion on any task
- **Labels** — Color-coded tags per board, assignable to tasks
- **Activity Log** — Full audit trail per task and per board
- **Real-time Updates** — WebSocket events push changes to all connected clients instantly
- **Full-text Search** — Search across task titles and descriptions
- **MCP Protocol** — AI agents connect via JSON-RPC to do everything humans can
- **Priority System** — Low / Medium / High / Urgent with visual indicators
- **WIP Limits** — Optional per-list work-in-progress limits
- **Soft Delete** — Tasks archive instead of hard-deleting
- **Single Container** — Everything (API + SPA + WebSocket) in one Docker image

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   TaskForge Container               │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │              NestJS Backend (:3000)            │   │
│  │                                               │   │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  │   │
│  │  │ REST API │  │ MCP API  │  │ WebSocket  │  │   │
│  │  │ /api/*   │  │ /api/mcp │  │ /ws        │  │   │
│  │  └──────────┘  └──────────┘  └────────────┘  │   │
│  │                                               │   │
│  │  ┌──────────────────────────────────────────┐ │   │
│  │  │         Prisma ORM → SQLite              │ │   │
│  │  └──────────────────────────────────────────┘ │   │
│  │                                               │   │
│  │  ┌──────────────────────────────────────────┐ │   │
│  │  │  React SPA (served as static assets)    │ │   │
│  │  └──────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Data Model

```
Board
 ├── Lists (ordered by position)
 │    ├── Tasks (ordered by position)
 │    │    ├── Comments
 │    │    ├── Activity (audit log)
 │    │    └── Labels (many-to-many via TaskLabel)
 │    └── WIP Limit (optional)
 ├── Labels (board-level)
 └── Members (board-level)
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 20
- **pnpm** >= 10 (install with `corepack enable && corepack prepare pnpm@10.12.1 --activate`)

### Local Development

```bash
# Clone
git clone https://github.com/emreycolakoglu/taskforge.git
cd taskforge

# Install dependencies
pnpm install

# Generate Prisma client and push schema to SQLite
cd apps/api
pnpm prisma:generate
pnpm prisma:push
cd ../..

# Start development servers (API on :3000, Web on :5173 with proxy)
pnpm dev
```

The API runs on `http://localhost:3000` and the Vite dev server on `http://localhost:5173` (proxied to the API).

### Docker (Production)

```bash
# Build and run
docker compose up --build

# Or build manually
docker build -t taskforge .
docker run -p 3000:3000 -v taskforge-data:/data taskforge
```

Then open **http://localhost:3000** in your browser.

---

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite database path. In Docker, use `file:/data/taskforge.db` for persistence |
| `CORS_ORIGIN` | `*` | Allowed CORS origin(s) |
| `NODE_ENV` | `development` | Set to `production` for production mode |

### .env file

```env
PORT=3000
DATABASE_URL=file:./prisma/dev.db
CORS_ORIGIN=*
```

---

## REST API

All endpoints are under `/api`. Request and response bodies are JSON.

### Boards

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/boards` | List all boards |
| `GET` | `/api/boards/:id` | Get board with lists and labels |
| `GET` | `/api/boards/:id/full` | Get board with lists, tasks, labels, members |
| `POST` | `/api/boards` | Create a board (auto-creates 5 default lists) |
| `PUT` | `/api/boards/:id` | Update board name/slug/description |
| `DELETE` | `/api/boards/:id` | Delete board and all its data |

**Create a board:**
```json
{ "name": "My Project", "slug": "my-project", "description": "Optional" }
```

### Lists

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/lists/board/:boardId` | List all lists in a board |
| `GET` | `/api/lists/:id` | Get a single list |
| `POST` | `/api/lists` | Create a list |
| `PUT` | `/api/lists/:id` | Update list name/color/wipLimit |
| `PUT` | `/api/lists/reorder` | Reorder lists |
| `DELETE` | `/api/lists/:id` | Delete list and its tasks |

**Create a list:**
```json
{ "boardId": "...", "name": "In Progress", "color": "#f59e0b", "wipLimit": 5 }
```

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tasks/board/:boardId` | List all active tasks in a board |
| `GET` | `/api/tasks/list/:listId` | List tasks in a specific list |
| `GET` | `/api/tasks/search?q=query` | Full-text search across tasks |
| `GET` | `/api/tasks/:id` | Get task with comments, activity, labels |
| `POST` | `/api/tasks` | Create a task |
| `PUT` | `/api/tasks/:id` | Update task fields |
| `PUT` | `/api/tasks/:id/move` | Move task to another list |
| `PUT` | `/api/tasks/reorder` | Reorder tasks within a list |
| `DELETE` | `/api/tasks/:id` | Archive a task (soft delete) |

**Create a task:**
```json
{
  "listId": "...",
  "title": "Implement login page",
  "description": "Add email/password and OAuth login",
  "priority": "high",
  "assignee": "alice",
  "dueDate": "2026-07-01T00:00:00Z",
  "labelIds": ["label-id-1", "label-id-2"]
}
```

**Move a task:**
```json
{ "listId": "new-list-id", "position": 0 }
```

### Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/comments/task/:taskId` | List comments on a task |
| `POST` | `/api/comments` | Add a comment |
| `DELETE` | `/api/comments/:id` | Delete a comment |

**Add a comment:**
```json
{ "taskId": "...", "author": "alice", "body": "Looks good to me!" }
```

### Labels

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/labels/board/:boardId` | List labels on a board |
| `POST` | `/api/labels` | Create a label |
| `PUT` | `/api/labels/:id` | Update label name/color |
| `DELETE` | `/api/labels/:id` | Delete a label |

**Create a label:**
```json
{ "boardId": "...", "name": "bug", "color": "#ef4444" }
```

### Activity

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/activity/task/:taskId` | Activity log for a task |
| `GET` | `/api/activity/board/:boardId` | Activity log for an entire board |

---

## MCP Server (AI Agent Interface)

TaskForge implements the **MCP (Model Context Protocol)** — a JSON-RPC 2.0 endpoint that lets AI agents interact with boards programmatically. Any MCP-compatible agent (Claude Code, Hermes, Cursor, GitHub Copilot, etc.) can connect to `POST /api/mcp` and perform all the same operations a human can.

### How Agents Connect

**Claude Code / Cursor / Copilot** — Add to your MCP config:

```json
{
  "mcpServers": {
    "taskforge": {
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

**Hermes Agent** — Add as a tool:

```yaml
tools:
  - name: taskforge
    type: mcp
    config:
      url: http://localhost:3000/api/mcp
```

**Any HTTP client** — Direct POST:

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"boards_list","params":{},"id":1}'
```

### Available MCP Methods

#### Boards
| Method | Params | Description |
|--------|--------|-------------|
| `boards_list` | `{}` | List all boards |
| `boards_get` | `{ id }` | Get board with lists, tasks, labels |
| `boards_create` | `{ name, slug, description? }` | Create board with 5 default lists |
| `boards_delete` | `{ id }` | Delete board |

#### Lists
| Method | Params | Description |
|--------|--------|-------------|
| `lists_list` | `{ boardId }` | List all lists in a board |
| `lists_create` | `{ boardId, name, color?, wipLimit?, position? }` | Create a list |
| `lists_update` | `{ id, name?, color?, wipLimit? }` | Update a list |
| `lists_delete` | `{ id }` | Delete a list |

#### Tasks
| Method | Params | Description |
|--------|--------|-------------|
| `tasks_list` | `{ boardId?, listId?, assignee?, status?, limit? }` | List tasks with filters |
| `tasks_get` | `{ id }` | Get task with comments, activity, labels |
| `tasks_search` | `{ query }` | Full-text search across tasks |
| `tasks_create` | `{ listId, title, description?, priority?, assignee?, dueDate?, labelIds?, metadata? }` | Create a task |
| `tasks_update` | `{ id, title?, description?, priority?, status?, assignee?, dueDate?, listId?, position?, labelIds? }` | Update a task |
| `tasks_move` | `{ id, listId, position? }` | Move task to another list |
| `tasks_delete` | `{ id }` | Archive a task |

#### Comments
| Method | Params | Description |
|--------|--------|-------------|
| `comments_list` | `{ taskId }` | List comments on a task |
| `comments_create` | `{ taskId, author, body }` | Add a comment |

#### Labels
| Method | Params | Description |
|--------|--------|-------------|
| `labels_list` | `{ boardId }` | List labels on a board |
| `labels_create` | `{ boardId, name, color? }` | Create a label |
| `labels_delete` | `{ id }` | Delete a label |

#### Activity
| Method | Params | Description |
|--------|--------|-------------|
| `activity_list` | `{ taskId?, boardId?, limit? }` | Get activity log |

### MCP Response Format

All responses follow JSON-RPC 2.0:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
```

On error:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": { "code": -32603, "message": "Task not found" }
}
```

### Example: Agent Creates a Board and Tasks

```json
// 1. Create a board
→ {"method":"boards_create","params":{"name":"Sprint 24","slug":"sprint-24"},"id":1}
← {"jsonrpc":"2.0","id":1,"result":{"id":"...","name":"Sprint 24","lists":[...]}}

// 2. Create tasks in the "To Do" list
→ {"method":"tasks_create","params":{"listId":"...","title":"Design API schema","priority":"high","assignee":"alice"},"id":2}
← {"jsonrpc":"2.0","id":2,"result":{"id":"...","title":"Design API schema",...}}

// 3. Move task to "In Progress"
→ {"method":"tasks_move","params":{"id":"...","listId":"in-progress-list-id"},"id":3}
← {"jsonrpc":"2.0","id":3,"result":{"id":"...","listId":"in-progress-list-id",...}}

// 4. Search for tasks
→ {"method":"tasks_search","params":{"query":"API"},"id":4}
← {"jsonrpc":"2.0","id":4,"result":[{...}]}
```

---

## WebSocket Events

The WebSocket server at `/ws` pushes real-time events to all connected clients. Connect with optional `boardId` query parameter to scope events:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws?boardId=board-123');
ws.onmessage = (event) => {
  const { event: name, data } = JSON.parse(event.data);
  console.log(name, data);
};
```

### Event Types

| Event | Payload | When |
|-------|---------|------|
| `board:created` | Board object | A new board is created |
| `list:created` | List object | A new list is added |
| `list:updated` | List object | A list is renamed/recolored |
| `task:created` | Task object | A new task is created |
| `task:updated` | Task object | A task is edited |
| `task:moved` | Task object | A task is moved to another list |
| `comment:created` | Comment object | A comment is added |

---

## Frontend (SPA)

The React SPA is served by the NestJS backend in production. In development, Vite proxies API and WebSocket requests to the backend.

### Views

- **Home** — Board list with create/delete
- **Kanban Board** — Drag-and-drop columns with task cards, labels, priority indicators, assignee avatars
- **List View** — Table with sortable columns (task, list, priority, assignee, due date)
- **Task Detail Modal** — Edit all fields, view activity log, add comments

### Tech Stack

- React 19 + TypeScript
- Vite (dev server with proxy)
- `@hello-pangea/dnd` (drag and drop)
- Socket.IO WebSocket client
- Inline styles (no CSS framework dependency)

---

## Docker

### Building

```bash
# Using docker-compose (recommended)
docker compose up --build

# Manual build
docker build -t taskforge .
```

The Dockerfile uses multi-stage builds:
1. **base** — Node 23 Alpine + pnpm
2. **deps** — Install all dependencies
3. **builder** — Generate Prisma client, build API and SPA
4. **runner** — Minimal production image with SQLite persistence

### Volumes

Mount a volume at `/data` to persist the SQLite database:

```yaml
volumes:
  - taskforge-data:/data
```

### Health Check

The container includes a health check that pings `GET /api/boards` every 30 seconds.

---

## Development

### Project Structure

```
taskforge/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Database schema
│   │   └── src/
│   │       ├── main.ts         # Entry point (SPA serving + CORS)
│   │       ├── app.module.ts   # Root module
│   │       ├── prisma/         # Prisma client service
│   │       ├── boards/         # Boards module (REST)
│   │       ├── lists/          # Lists module (REST)
│   │       ├── tasks/          # Tasks module (REST)
│   │       ├── comments/       # Comments module (REST)
│   │       ├── labels/         # Labels module (REST)
│   │       ├── activity/       # Activity log module (REST)
│   │       ├── events/         # WebSocket gateway + event bus
│   │       └── mcp/            # MCP JSON-RPC server
│   └── web/                    # React SPA
│       └── src/
│           ├── App.tsx
│           ├── pages/          # HomePage
│           ├── components/     # KanbanBoard, TaskCard, TaskDetail, CreateTaskModal
│           ├── hooks/          # api.ts, useSocket.ts
│           └── types/          # TypeScript interfaces
├── Dockerfile
├── docker-compose.yml
├── package.json                # Root workspace config
├── pnpm-workspace.yaml
└── turbo.json                  # Turborepo pipeline
```

### Commands

```bash
pnpm dev              # Start both API and web in dev mode
pnpm build            # Build both apps
pnpm lint             # Lint all apps
pnpm clean            # Clean build artifacts

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to SQLite
pnpm db:migrate       # Run Prisma migrations

# Docker
pnpm docker:build     # Build Docker image
pnpm docker:run       # Run Docker container
```

### Adding a New Module

1. Create `apps/api/src/<module>/` with controller, service, module, and DTO files
2. Register the module in `apps/api/src/app.module.ts`
3. Add MCP methods in `apps/api/src/mcp/mcp.service.ts`
4. Add API client methods in `apps/web/src/hooks/api.ts`
5. Add WebSocket event handling in `apps/web/src/hooks/useSocket.ts`

---

## Use Cases

### Solo Developer
Run locally with SQLite. Use the SPA for daily work, the MCP server to let your AI coding agent create and manage tasks automatically.

### Small Team
Deploy on a single VPS with Docker. Everyone uses the SPA. CI/CD pipelines use the REST API to create release tasks. AI agents join standups and update boards.

### Agent-First Workflow
Your AI agent manages the entire board. The agent creates tasks from PR descriptions, moves them through review stages, assigns reviewers, and archives completed work — all via MCP. Humans check in via the SPA when needed.

### Hybrid
Humans use the Kanban board. AI agents use MCP to:
- Create tasks from bug reports
- Move tasks through pipeline stages
- Assign work based on team capacity
- Search and report on task status
- Add comments with analysis results

---

## FAQ

**Q: Can I use a different database?**
A: Yes. Change the `provider` in `prisma/schema.prisma` from `sqlite` to `postgresql` or `mysql`, update `DATABASE_URL`, and run `pnpm db:push`. Prisma handles the rest.

**Q: Is there authentication?**
A: Not yet. TaskForge is designed for local/trusted-network use. For production, add a NestJS guard (Passport, JWT, etc.) and pass auth tokens via headers.

**Q: Can I deploy to Fly.io / Railway / Render?**
A: Yes. The Docker image is self-contained. Set `DATABASE_URL` to a persistent volume path. For SQLite, ensure the volume persists across restarts. For production, consider PostgreSQL.

**Q: How do I add custom fields to tasks?**
A: Use the `metadata` field — it's a JSON string that accepts arbitrary data. Parse it in your frontend or agent logic.

**Q: Can multiple agents connect simultaneously?**
A: Yes. The MCP endpoint is stateless and handles concurrent requests. WebSocket events broadcast to all connected clients.

---

## License

MIT

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request
