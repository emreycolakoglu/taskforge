import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { SettingsService } from '../settings/settings.service';

describe('MailerService', () => {
  let service: MailerService;
  let sendMail: jest.Mock;
  let capturedOpts: Record<string, unknown> | undefined;
  let settingsService: { getFullSettings: jest.Mock };

  beforeEach(async () => {
    sendMail = jest.fn().mockResolvedValue({ messageId: 'test' });
    capturedOpts = undefined;
    settingsService = { getFullSettings: jest.fn().mockResolvedValue({}) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailerService, { provide: SettingsService, useValue: settingsService }],
    }).compile();
    service = module.get<MailerService>(MailerService);
    // Stub the transport seam so no real SMTP is contacted; capture options for assertions
    (service as any).createTransport = (opts: unknown) => {
      capturedOpts = opts as Record<string, unknown>;
      return { sendMail };
    };
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

  it('omits auth when only username is configured', async () => {
    settingsService.getFullSettings.mockResolvedValue({
      smtpHost: 'smtp.test',
      smtpUsername: 'user',
    });
    await service.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(capturedOpts?.auth).toBeUndefined();
  });

  it('defaults port to 587 when smtpPort is unset', async () => {
    settingsService.getFullSettings.mockResolvedValue({ smtpHost: 'smtp.test' });
    await service.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(capturedOpts?.port).toBe(587);
  });

  it('passes secure: false and port through for STARTTLS shape', async () => {
    settingsService.getFullSettings.mockResolvedValue({
      smtpHost: 'smtp.test',
      smtpPort: 587,
      smtpSecure: false,
    });
    await service.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(capturedOpts?.secure).toBe(false);
    expect(capturedOpts?.port).toBe(587);
  });

  it('passes host, port, secure and auth through for full config', async () => {
    settingsService.getFullSettings.mockResolvedValue({
      smtpHost: 'smtp.test',
      smtpPort: 465,
      smtpUsername: 'user',
      smtpPassword: 'pass',
      smtpSecure: true,
    });
    await service.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    expect(capturedOpts).toEqual({
      host: 'smtp.test',
      port: 465,
      secure: true,
      auth: { user: 'user', pass: 'pass' },
    });
  });
});
