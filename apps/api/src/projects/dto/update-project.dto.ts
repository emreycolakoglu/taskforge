import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { PROJECT_STATUSES } from '../project-statuses';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsNumber()
  position?: number;
}
