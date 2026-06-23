import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { EventsModule } from '../events/events.module';
import { RelationsModule } from '../relations/relations.module';

@Module({
  imports: [EventsModule, RelationsModule],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
