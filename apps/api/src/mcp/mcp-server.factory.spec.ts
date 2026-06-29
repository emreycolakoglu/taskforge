import { McpServerFactory } from './mcp-server.factory';
import { McpService } from './mcp.service';
import { EventsService } from '../events/events.service';
import { RelationsService } from '../relations/relations.service';
import { PrismaService } from '../prisma/prisma.service';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TOOL_NAMES } from './tool-definitions';
import { createTestPrisma, seedUser } from '../../test/setup';

describe('McpServerFactory', () => {
  let prisma: PrismaService;
  let factory: McpServerFactory;
  let user: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const events = new EventsService();
    const relations = new RelationsService(prisma as any, events);
    const mcpService = new McpService(prisma as any, events, relations);
    factory = new McpServerFactory(mcpService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
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

  it('registers all 24 taskforge tools', async () => {
    user = await seedUser(prisma as any);
    const server = factory.create(user);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const toolsListResponse = await new Promise<any>((resolve, reject) => {
      clientTransport.onmessage = (msg) => {
        if ((msg as any).id === 1) resolve(msg);
      };
      clientTransport.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      } as any).catch(reject);
      setTimeout(() => reject(new Error('tools/list timeout')), 2000);
    });

    expect(toolsListResponse.result.tools).toBeDefined();
    const names = toolsListResponse.result.tools.map((t: any) => t.name);
    for (const name of TOOL_NAMES) {
      expect(names).toContain(name);
    }
    expect(names).toHaveLength(TOOL_NAMES.length);

    await server.close();
    await clientTransport.close();
  });

  it('tools/call dispatches to McpService and returns JSON content', async () => {
    user = await seedUser(prisma as any);
    const server = factory.create(user);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const callResponse = await new Promise<any>((resolve, reject) => {
      clientTransport.onmessage = (msg) => {
        if ((msg as any).id === 10) resolve(msg);
      };
      clientTransport.send({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'boards_list', arguments: {} },
      } as any).catch(reject);
      setTimeout(() => reject(new Error('tools/call timeout')), 2000);
    });

    expect(callResponse.result).toBeDefined();
    expect(callResponse.result.content).toBeDefined();
    expect(callResponse.result.content[0].type).toBe('text');
    const parsed = JSON.parse(callResponse.result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);

    await server.close();
    await clientTransport.close();
  });
});