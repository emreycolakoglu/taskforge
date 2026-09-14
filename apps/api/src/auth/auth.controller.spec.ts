import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { IS_PUBLIC_KEY } from './public.decorator';

describe('AuthController password reset routes', () => {
  let controller: AuthController;
  const authService = {
    requestPasswordReset: jest.fn().mockResolvedValue({ success: true }),
    resetPassword: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();
    controller = module.get(AuthController);
  });

  it('delegates forgot-password to the service', async () => {
    const dto: ForgotPasswordDto = { email: 'a@b.com' };
    await expect(controller.forgotPassword(dto)).resolves.toEqual({ success: true });
    expect(authService.requestPasswordReset).toHaveBeenCalledWith('a@b.com');
  });

  it('delegates reset-password to the service', async () => {
    const dto: ResetPasswordDto = { token: 'raw', password: 'newpassword' };
    await expect(controller.resetPassword(dto)).resolves.toEqual({ success: true });
    expect(authService.resetPassword).toHaveBeenCalledWith('raw', 'newpassword');
  });

  it('marks forgot-password and reset-password as public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.forgotPassword)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.resetPassword)).toBe(true);
  });

  it('marks the existing public handlers as public', () => {
    for (const handler of ['getStatus', 'onboard', 'login', 'signup'] as const) {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype[handler])).toBe(true);
    }
  });
});
