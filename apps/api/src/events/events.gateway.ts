import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventsService } from './events.service';
import { AuthService } from '../auth/auth.service';

@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/ws/',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private authTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private events: EventsService,
    private authService: AuthService,
  ) {}

  afterInit() {
    this.events.observe().subscribe(({ event, data, boardId, userRoom }) => {
      if (userRoom) {
        this.server.to(`user:${userRoom}`).emit(event, data);
      } else if (boardId) {
        this.server.to(`board:${boardId}`).emit(event, data);
      } else {
        this.server.emit(event, data);
      }
    });
  }

  handleConnection(client: Socket) {
    client.data.authGeneration = (client.data.authGeneration ?? 0) + 1;
    client.data.authRevision = undefined;
    client.data.authenticated = false;
    client.data.boardId = undefined;
    client.data.userId = undefined;
    client.data.user = undefined;

    // Set 5-second deadline for authentication
    const timeout = setTimeout(() => {
      if (!client.data.authenticated) {
        client.emit('auth_error', { message: 'Authentication required within 5 seconds' });
        client.disconnect(true);
      }
    }, 5000);
    this.authTimeouts.set(client.id, timeout);
  }

  handleDisconnect(client: Socket) {
    client.data.authGeneration = (client.data.authGeneration ?? 0) + 1;
    client.data.authenticated = false;
    client.data.boardId = undefined;
    client.data.userId = undefined;
    client.data.user = undefined;

    const timeout = this.authTimeouts.get(client.id);
    if (timeout) {
      clearTimeout(timeout);
      this.authTimeouts.delete(client.id);
    }
  }

  @SubscribeMessage('auth')
  async handleAuth(client: Socket, data: { token: string; boardId?: string; revision?: number }) {
    const authGeneration = client.data.authGeneration ?? 0;
    client.data.authGeneration = authGeneration;
    const revision = data.revision ?? ((client.data.authRevision as number | undefined) ?? 0) + 1;
    const latestRevision = client.data.authRevision as number | undefined;
    if (latestRevision !== undefined && revision < latestRevision) return;
    client.data.authRevision = revision;

    try {
      const user = await this.authService.validateSession(data.token);
      if (client.data.authGeneration !== authGeneration || client.data.authRevision !== revision) {
        return;
      }

      if (!user) {
        client.emit('auth_error', { message: 'Invalid or expired token' });
        client.disconnect(true);
        return;
      }

      // Clear the auth timeout
      const timeout = this.authTimeouts.get(client.id);
      if (timeout) {
        clearTimeout(timeout);
        this.authTimeouts.delete(client.id);
      }

      const previousBoardId = client.data.boardId as string | undefined;
      const previousUserId = client.data.userId as string | undefined;

      // Mark socket as authenticated
      client.data.authenticated = true;
      client.data.userId = user.id;
      client.data.user = user;

      if (previousBoardId && previousBoardId !== data.boardId) {
        client.leave(`board:${previousBoardId}`);
      }
      if (previousUserId && previousUserId !== user.id) {
        client.leave(`user:${previousUserId}`);
      }
      if (data.boardId) {
        client.join(`board:${data.boardId}`);
      }
      client.data.boardId = data.boardId;

      client.join(`user:${user.id}`);

      client.emit('auth_success', { user });
    } catch {
      if (client.data.authGeneration !== authGeneration || client.data.authRevision !== revision) {
        return;
      }

      client.emit('auth_error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }
}
