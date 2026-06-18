import { Controller, Get, Put, Body } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Public } from '../auth/public.decorator';
import { Admin } from '../auth/admin.decorator';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

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
}