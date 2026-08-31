import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ViewFiltersDto } from './view-filters.dto';

const GROUP_BY = ['status', 'assignee', 'priority', 'label', 'none'] as const;
const SORT_BY = ['position', 'priority', 'dueDate', 'title'] as const;
const LAYOUTS = ['board', 'list'] as const;

export class CreateViewDto {
  @IsNotEmpty()
  @IsString()
  boardId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => ViewFiltersDto)
  filters: ViewFiltersDto;

  @IsOptional()
  @IsIn(GROUP_BY)
  groupBy?: string;

  @IsOptional()
  @IsIn(SORT_BY)
  sortBy?: string;

  @IsOptional()
  @IsIn(LAYOUTS)
  layout?: string;

  @IsNotEmpty()
  @IsBoolean()
  shared: boolean;

  @IsOptional()
  @IsNumber()
  position?: number;
}
