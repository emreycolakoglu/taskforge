import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import { PROJECT_STATUSES } from '../project-statuses';

// description, leadId, startDate and targetDate accept null to clear the field
// (@IsOptional skips validation for null as well as undefined — same as
// UpdateTaskDto.projectId). ProjectsService maps null → null.
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  leadId?: string | null;

  @IsOptional()
  @IsIn(PROJECT_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @IsOptional()
  @IsNumber()
  position?: number;
}
