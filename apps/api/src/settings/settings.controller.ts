import { Controller, Get, Put, Post, Body, BadRequestException } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { SettingsService } from './settings.service';
import { MailerService } from '../mailer/mailer.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Public } from '../auth/public.decorator';
import { Admin } from '../auth/admin.decorator';

class TestEmailDto {
  @IsEmail()
  to: string;
}

@Controller('api/settings')
export class SettingsController {
  constructor(
    private readonly service: SettingsService,
    private readonly mailer: MailerService,
  ) {}

  @Get()
  @Admin()
  async getSettings() {
    return this.service.getFullSettings();
  }

  @Get('initialized')
  @Public()
  async isInitialized() {
    const initialized = await this.service.isInitialized();
    return { initialized };
  }

  @Get('title')
  @Public()
  async getTitle() {
    const title = await this.service.getTitle();
    return { title };
  }

  @Put()
  @Admin()
  async update(@Body() dto: UpdateSettingsDto) {
    return this.service.updateSettings(dto);
  }

  @Post('test-email')
  @Admin()
  async sendTestEmail(@Body() dto: TestEmailDto) {
    try {
      const title = await this.service.getTitle();
      await this.mailer.send({
        to: dto.to,
        subject: `Test email from ${title}`,
        html: `<p>This is a test email from <strong>${title}</strong>. If you received it, SMTP settings are working.</p>`,
        text: `This is a test email from ${title}. If you received it, SMTP settings are working.`,
      });
    } catch (err) {
      // Surface the underlying SMTP error verbatim so the admin sees why config fails
      const message = err instanceof Error ? err.message : 'Failed to send test email';
      throw new BadRequestException(message);
    }
    return { success: true };
  }
}
