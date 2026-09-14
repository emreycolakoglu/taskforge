import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
