import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { McpTransportController } from './mcp-transport.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpService } from './mcp.service';
import { TOOL_NAMES } from './tool-definitions';
import { EventsService } from '../events/events.service';
import { RelationsService } from '../relations/relations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedUser, seedBoard } from '../../test/setup';

interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  /** Parsed JSON-RPC message extracted from either a JSON body or an SSE event stream. */
  json: any;
  /** Mcp-Session-Id header if present. */
  sessionId?: string;
}

function parseSseMessages(body: string): any[] {
  const events: any[] = [];
  for (const chunk of body.split(/\r?\n\r?\n/)) {
    const lines = chunk.split(/\r?\n/);
    let data = '';
    let eventName = '';
    for (const line of lines) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (data) {
      try { events.push({ event: eventName, payload: JSON.parse(data) }); } catch {}
    }
  }
  return events;
}

function call(
  controller: McpTransportController,
  method: string,
  body: any,
  headers: Record<string, string>,
  user: any,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = body !== null && body !== undefined ? JSON.stringify(body) : '';

    const allHeaders: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'content-length': String(Buffer.byteLength(payload)),
      host: 'localhost:3000',
      ...headers,
    };
    // @hono/node-server reads rawHeaders (flat [key,value,...]) to build the
    // web-standard Headers object, so we must populate both.
    const rawHeaders: string[] = [];
    for (const [k, v] of Object.entries(allHeaders)) {
      rawHeaders.push(k, v);
    }

    const { PassThrough } = require('stream');
    const socket = new PassThrough();
    const req = new IncomingMessage(socket as any);
    (req as any).method = method;
    (req as any).url = '/api/mcp';
    (req as any).headers = allHeaders;
    (req as any).rawHeaders = rawHeaders;
    (req as any).user = user;
    process.nextTick(() => {
      if (payload) socket.push(Buffer.from(payload));
      socket.push(null);
    });

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    let writtenHeaders: Record<string, string> = {};
    const origWriteHead = res.writeHead.bind(res);
    (res as any).writeHead = (code: number, headers?: Record<string, string>) => {
      res.statusCode = code;
      if (headers) writtenHeaders = { ...writtenHeaders, ...headers };
      return res;
    };
    (res as any).write = (chunk: any, ...rest: any[]) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    };
    (res as any).end = (chunk?: any, ...rest: any[]) => {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const bodyText = Buffer.concat(chunks).toString('utf-8');
      const contentType = writtenHeaders['content-type'] || (res.getHeader('content-type') as string) || '';
      let json: any = null;
      if (contentType.includes('text/event-stream') || bodyText.startsWith('event:')) {
        const events = parseSseMessages(bodyText);
        const messageEvent = events.find(e => e.event === 'message');
        json = messageEvent?.payload ?? null;
      } else {
        try { json = JSON.parse(bodyText); } catch {}
      }
      const sessionId = writtenHeaders['mcp-session-id'];
      resolve({ status: res.statusCode, headers: { ...writtenHeaders, ...(res.getHeaders() as any) }, body: bodyText, json, sessionId });
      return res;
    };

    if (method === 'POST') {
      controller.handlePost(req as any, res as any, body);
    } else if (method === 'DELETE') {
      controller.handleDelete(req as any, res as any);
    } else {
      reject(new Error(`unsupported method ${method}`));
    }
  });
}

describe('McpTransportController', () => {
  let prisma: PrismaService;
  let controller: McpTransportController;
  let user: any;
  let board: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const events = new EventsService();
    const relations = new RelationsService(prisma as any, events);
    const subscriptions = new SubscriptionsService(prisma as any);
    const notifications = new NotificationsService(prisma as any, events);
    const mcpService = new McpService(prisma as any, events, relations, subscriptions, notifications);
    const factory = new McpServerFactory(mcpService);
    controller = new McpTransportController(factory);
    process.env.MCP_REQUIRE_ORIGIN = '0';
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    user = await seedUser(prisma as any);
    board = await seedBoard(prisma as any);
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.taskRelation.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.list.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  async function post(body: any, sessionId?: string): Promise<HttpResponse> {
    const headers: Record<string, string> = {};
    if (sessionId) headers['mcp-session-id'] = sessionId;
    return call(controller, 'POST', body, headers, user);
  }

  async function del(sessionId: string): Promise<HttpResponse> {
    return call(controller, 'DELETE', null, { 'mcp-session-id': sessionId }, user);
  }

  it('initialize → 200 with Mcp-Session-Id and serverInfo', async () => {
    const r = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    expect(r.status).toBe(200);
    expect(r.sessionId).toBeDefined();
    expect(r.json.result.serverInfo.name).toBe('taskforge');
    expect(r.json.result.capabilities.tools).toBeDefined();
  });

  it('initialized notification with session id → 2xx', async () => {
    const init = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    const sid = init.sessionId!;
    const r = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid);
    expect(r.status).toBeGreaterThanOrEqual(200);
    expect(r.status).toBeLessThan(300);
  });

  it('tools/list with session id → 200 with 24 tools', async () => {
    const init = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    const sid = init.sessionId!;
    const r = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sid);
    expect(r.status).toBe(200);
    expect(r.json.result.tools).toHaveLength(TOOL_NAMES.length);
    expect(r.json.result.tools.map((t: any) => t.name)).toContain('boards_create');
  });

  it('tools/call boards_create then boards_list → created board appears', async () => {
    const init = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    const sid = init.sessionId!;

    const create = await post({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'boards_create', arguments: { name: 'Mcp Board', slug: 'mcp-board', identifier: 'MCP' } },
    }, sid);
    expect(create.status).toBe(200);
    const created = JSON.parse(create.json.result.content[0].text);
    expect(created.name).toBe('Mcp Board');

    const list = await post({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'boards_list', arguments: {} },
    }, sid);
    const boards = JSON.parse(list.json.result.content[0].text);
    expect(boards.some((b: any) => b.name === 'Mcp Board')).toBe(true);
  });

  it('actor attribution: tasks_create records activity with bot user as actor', async () => {
    const init = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    const sid = init.sessionId!;

    await post({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'tasks_create', arguments: { listId: board.lists[0].id, title: 'Transport test task' } },
    }, sid);

    const activity = await prisma.activity.findFirst({ where: { action: 'created' } });
    expect(activity?.actorId).toBe(user.id);
    expect(activity?.actor).toBe(user.displayName);
  });

  it('unknown session id → 404', async () => {
    const r = await post({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} }, 'nonexistent-session-id');
    expect(r.status).toBe(404);
  });

  it('missing session id on non-initialize → 400', async () => {
    const r = await post({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} });
    expect(r.status).toBe(400);
  });

  it('DELETE session → subsequent POST with that id → 404', async () => {
    const init = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
    });
    const sid = init.sessionId!;

    const d = await del(sid);
    expect(d.status).toBe(204);

    const r = await post({ jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} }, sid);
    expect(r.status).toBe(404);
  });
});