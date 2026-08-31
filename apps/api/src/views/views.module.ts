import { Module } from '@nestjs/common';
import { ViewsController } from './views.controller';
import { ViewsService } from './views.service';
import { EventsModule } from '../events/events.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [EventsModule, MembersModule],
  controllers: [ViewsController],
  providers: [ViewsService],
  exports: [ViewsService],
})
export class ViewsModule {}
