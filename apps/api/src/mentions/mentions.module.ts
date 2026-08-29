import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { MentionsService } from './mentions.service';

@Module({
  imports: [NotificationsModule],
  providers: [MentionsService],
  exports: [MentionsService],
})
export class MentionsModule {}
