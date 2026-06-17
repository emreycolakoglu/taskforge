import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventsService } from './events.service';

@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  namespace: '/ws',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private events: EventsService) {}

  afterInit() {
    this.events.observe().subscribe(({ event, data }) => {
      this.server.emit(event, data);
    });
  }

  handleConnection(client: Socket) {
    // Client can subscribe to specific board
    const boardId = client.handshake.query.boardId as string;
    if (boardId) {
      client.join(`board:${boardId}`);
    }
  }

  handleDisconnect() {}
}
