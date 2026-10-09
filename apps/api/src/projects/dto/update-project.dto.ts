import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PROJECT_STATUSES } from '../project-statuses';

// description, leadId, startDate and targetDate accept null to clear the field
// (@IsOptional skips validation for null as well as undefined — same as
// UpdateTaskDto.projectId). ProjectsService maps null → null. name, icon and
// status are NOT clearable: they validate whenever present, so null is a 400
// instead of a NOT NULL constraint failure.
export class UpdateProjectDto {
  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  leadId?: string | null;

  @ValidateIf((_, v) => v !== undefined)
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
