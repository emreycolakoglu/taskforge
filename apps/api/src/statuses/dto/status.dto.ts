import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class CreateStatusDto {
  @IsString()
  boardId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  wipLimit?: number;
}

export class UpdateStatusDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  wipLimit?: number;
}

export class ReorderStatusesDto {
  @IsArray()
  items: { id: string; position: number }[];
}
