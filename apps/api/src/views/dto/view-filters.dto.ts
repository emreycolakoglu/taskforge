import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export class DueDateRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ViewFiltersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(PRIORITIES, { each: true })
  priorities?: string[];

  @IsOptional()
  @ValidateNested()
  dueDateRange?: DueDateRangeDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  searchQuery?: string;
}
