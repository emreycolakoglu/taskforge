import { IsString, IsOptional, IsNumber, IsArray, IsIn } from 'class-validator';
import { STATUS_TYPES } from '../status-types';

export class CreateStatusDto {
  @IsString()
  boardId: string;

  @IsString()
  name: string;

  @IsIn(STATUS_TYPES)
  type: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateStatusDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(STATUS_TYPES)
  type?: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;
}

export class ReorderStatusesDto {
  @IsArray()
  items: { id: string; position: number }[];
}
