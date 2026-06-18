import { Controller, Get, Post, Patch, Delete, Body, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { OnboardDto } from './dto/onboard.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Public } from './public.decorator';
import { Admin } from './admin.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('status')
  @Public()
  async getStatus() {
    const initialized = await this.authService.isInitialized();
    if (!initialized) {
      return { onboarded: false, title: null };
    }
    const title = await this.authService.getInstanceTitle();
    return { onboarded: true, title };
  }

  @Post('onboard')
  @Public()
  async onboard(@Body() dto: OnboardDto) {
    return this.authService.onboard(dto);
  }

  @Post('login')
  @Public()
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('logout')
  async logout(@Req() req: Request) {
    const token = (req as any).session?.token;
    await this.authService.logout(token);
    return { success: true };
  }

  @Post('invite')
  @Admin()
  async createInvite(@Req() req: Request) {
    const user = (req as any).user;
    return this.authService.createInvite(user.id);
  }

  @Post('signup/:token')
  @Public()
  async signup(@Param('token') token: string, @Body() dto: SignupDto) {
    return this.authService.signup(token, dto);
  }

  @Post('bot-token')
  @Admin()
  async createBotToken(@Req() req: Request) {
    const user = (req as any).user;
    return this.authService.createBotToken(user.id);
  }

  @Get('me')
  async me(@Req() req: Request) {
    return (req as any).user;
  }

  @Patch('me')
  async updateMe(@Req() req: Request, @Body() dto: UpdateUserDto) {
    const user = (req as any).user;
    return this.authService.updateUser(user.id, dto);
  }

  @Get('users')
  @Admin()
  async findAllUsers() {
    return this.authService.findAllUsers();
  }

  @Get('invites')
  @Admin()
  async findAllInvites() {
    return this.authService.findAllInvites();
  }

  @Delete('invites/:id')
  @Admin()
  async revokeInvite(@Param('id') id: string) {
    await this.authService.revokeInvite(id);
    return { success: true };
  }

}