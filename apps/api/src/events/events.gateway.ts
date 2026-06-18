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
    this.events.observe().subscribe(({ event, data, boardId }) => {
      if (boardId) {
        this.server.to(`board:${boardId}`).emit(event, data);
      } else {
        this.server.emit(event, data);
      }
    });
  }

  handleConnection(client: Socket) {
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
    const timeout = this.authTimeouts.get(client.id);
    if (timeout) {
      clearTimeout(timeout);
      this.authTimeouts.delete(client.id);
    }
  }

  @SubscribeMessage('auth')
  async handleAuth(client: Socket, data: { token: string; boardId?: string }) {
    try {
      const user = await this.authService.validateSession(data.token);
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

      // Mark socket as authenticated
      client.data.authenticated = true;
      client.data.userId = user.id;
      client.data.user = user;

      // Join board room if boardId provided
      if (data.boardId) {
        client.join(`board:${data.boardId}`);
      }

      client.emit('auth_success', { user });
    } catch {
      client.emit('auth_error', { message: 'Authentication failed' });
      client.disconnect(true);
    }
  }
}