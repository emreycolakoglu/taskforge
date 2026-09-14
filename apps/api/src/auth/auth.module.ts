import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { SessionCleanupService } from './session-cleanup.service';
import { MailerModule } from '../mailer/mailer.module';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [MailerModule],
  controllers: [AuthController],
  providers: [AuthService, SessionCleanupService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
