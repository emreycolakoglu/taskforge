import { Module } from '@nestjs/common';
import { McpTransportController } from './mcp-transport.controller';
import { McpService } from './mcp.service';
import { McpServerFactory } from './mcp-server.factory';
import { EventsModule } from '../events/events.module';
import { RelationsModule } from '../relations/relations.module';

@Module({
  imports: [EventsModule, RelationsModule],
  controllers: [McpTransportController],
  providers: [McpService, McpServerFactory],
  exports: [McpService],
})
export class McpModule {}