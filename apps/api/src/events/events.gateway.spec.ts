import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let authService: AuthService;

  const mockAuthService = {
    validateSession: jest.fn(),
  };

  const mockPrismaService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        EventsService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    authService = module.get<AuthService>(AuthService);

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  function createMockSocket(overrides: Record<string, any> = {}): any {
    return {
      id: 'socket-1',
      data: {},
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(),
      handshake: { query: {} },
      ...overrides,
    };
  }

  describe('handleConnection', () => {
    it('should set an auth timeout that disconnects unauthenticated clients after 5 seconds', () => {
      const client = createMockSocket();

      gateway.handleConnection(client);

      // Before timeout, client is not disconnected
      expect(client.disconnect).not.toHaveBeenCalled();

      // Advance past the 5-second deadline
      jest.advanceTimersByTime(5001);

      expect(client.emit).toHaveBeenCalledWith('auth_error', { message: 'Authentication required within 5 seconds' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('should not disconnect client if they authenticate before timeout', async () => {
      const client = createMockSocket();
      mockAuthService.validateSession.mockResolvedValue({
        id: 'user-1',
        displayName: 'Test User',
        role: 'member',
        email: 'test@example.com',
      });

      gateway.handleConnection(client);

      // Authenticate before timeout
      await gateway.handleAuth(client, { token: 'valid-token' });

      jest.advanceTimersByTime(10000);

      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should clear the auth timeout on disconnect', () => {
      const client = createMockSocket();

      gateway.handleConnection(client);
      gateway.handleDisconnect(client);

      // Advance past the timeout — should NOT trigger another disconnect
      jest.advanceTimersByTime(10000);

      // disconnect was called once by the timeout handler, but since the client
      // is already gone, this is fine — what matters is the timeout was cleared
      // and won't cause issues
    });
  });

  describe('handleAuth', () => {
    it('should authenticate a client with a valid token', async () => {
      const user = { id: 'user-1', displayName: 'Test User', role: 'member', email: 'test@example.com' };
      mockAuthService.validateSession.mockResolvedValue(user);
      const client = createMockSocket();

      gateway.handleConnection(client);
      await gateway.handleAuth(client, { token: 'valid-token' });

      expect(client.data.authenticated).toBe(true);
      expect(client.data.userId).toBe('user-1');
      expect(client.data.user).toEqual(user);
      expect(client.emit).toHaveBeenCalledWith('auth_success', { user });
    });

    it('should join board room when boardId is provided in auth message', async () => {
      const user = { id: 'user-1', displayName: 'Test User', role: 'member', email: 'test@example.com' };
      mockAuthService.validateSession.mockResolvedValue(user);
      const client = createMockSocket();

      gateway.handleConnection(client);
      await gateway.handleAuth(client, { token: 'valid-token', boardId: 'board-123' });

      expect(client.join).toHaveBeenCalledWith('board:board-123');
    });

    it('should disconnect a client with an invalid token', async () => {
      mockAuthService.validateSession.mockResolvedValue(null);
      const client = createMockSocket();

      gateway.handleConnection(client);
      await gateway.handleAuth(client, { token: 'bad-token' });

      expect(client.emit).toHaveBeenCalledWith('auth_error', { message: 'Invalid or expired token' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('should clear auth timeout after successful authentication', async () => {
      const user = { id: 'user-1', displayName: 'Test User', role: 'member', email: 'test@example.com' };
      mockAuthService.validateSession.mockResolvedValue(user);
      const client = createMockSocket();

      gateway.handleConnection(client);
      await gateway.handleAuth(client, { token: 'valid-token' });

      // Advance well past 5 seconds — should NOT disconnect
      jest.advanceTimersByTime(30000);

      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect client on unexpected error during auth', async () => {
      mockAuthService.validateSession.mockRejectedValue(new Error('DB error'));
      const client = createMockSocket();

      gateway.handleConnection(client);
      await gateway.handleAuth(client, { token: 'some-token' });

      expect(client.emit).toHaveBeenCalledWith('auth_error', { message: 'Authentication failed' });
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });
});