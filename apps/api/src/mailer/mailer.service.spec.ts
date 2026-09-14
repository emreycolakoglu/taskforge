import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { SettingsService } from '../settings/settings.service';

describe('MailerService', () => {
  let service: MailerService;
  let sendMail: jest.Mock;
  let settingsService: { getFullSettings: jest.Mock };

  beforeEach(async () => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'test' });
    settingsService = { getFullSettings: jest.fn().mockResolvedValue({}) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailerService, { provide: SettingsService, useValue: settingsService }],
    }).compile();
    service = module.get<MailerService>(MailerService);
    // Stub the transport seam so no real SMTP is contacted
    (service as any).createTransport = (opts: unknown) => ({ sendMail });
  });

  it('should throw BadRequestException when SMTP is not configured', async () => {
    settingsService.getFullSettings.mockResolvedValue({ smtpHost: null });
    await expect(
      service.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>', text: 't' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should send with saved config and mapped fields', async () => {
    settingsService.getFullSettings.mockResolvedValue({
      title: 'TF',
      smtpHost: 'smtp.test',
      smtpPort: 465,
      smtpUsername: 'user',
      smtpPassword: 'pass',
      smtpFromEmail: 'from@tf.dev',
      smtpFromName: 'TF Mailer',
      smtpSecure: true,
    });
    await service.send({ to: 'a@b.com', subject: 's', html: '<p>h</p>', text: 't' });
    expect(sendMail).toHaveBeenCalledWith({
      from: '"TF Mailer" <from@tf.dev>',
      to: 'a@b.com',
      subject: 's',
      html: '<p>h</p>',
      text: 't',
    });
  });

  it('should fall back to fromEmail-only when fromName empty', async () => {
    settingsService.getFullSettings.mockResolvedValue({
      smtpHost: 'smtp.test',
      smtpPort: 587,
      smtpSecure: false,
      smtpFromEmail: 'from@tf.dev',
      smtpFromName: '',
    });
    await service.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'from@tf.dev' }));
  });

  it('isConfigured returns true only when smtpHost set', async () => {
    settingsService.getFullSettings.mockResolvedValue({ smtpHost: 'smtp.test' });
    expect(await service.isConfigured()).toBe(true);
    settingsService.getFullSettings.mockResolvedValue({ smtpHost: null });
    expect(await service.isConfigured()).toBe(false);
  });
});
