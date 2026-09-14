import { Injectable, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { SettingsService } from '../settings/settings.service';

interface SendParams {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class MailerService {
  constructor(private settings: SettingsService) {}

  async isConfigured(): Promise<boolean> {
    const s = await this.settings.getFullSettings();
    return !!s.smtpHost;
  }

  async send(params: SendParams): Promise<void> {
    const s = await this.settings.getSmtpConfig();
    if (!s.smtpHost) {
      throw new BadRequestException('SMTP is not configured');
    }
    const transport = this.createTransport({
      host: s.smtpHost,
      port: s.smtpPort ?? 587,
      secure: s.smtpSecure,
      auth:
        s.smtpUsername && s.smtpPassword
          ? { user: s.smtpUsername, pass: s.smtpPassword }
          : undefined,
    });
    const from = s.smtpFromName ? `"${s.smtpFromName}" <${s.smtpFromEmail}>` : s.smtpFromEmail;
    await transport.sendMail({ from, ...params });
  }

  /** Test seam: thin wrapper over nodemailer.createTransport, stubbed in specs. */
  createTransport(opts: SMTPTransport.Options) {
    return nodemailer.createTransport(opts);
  }
}
