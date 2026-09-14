import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { MailerService } from '../mailer/mailer.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, MailerService],
  exports: [SettingsService],
})
export class SettingsModule {}
