import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class CreateListDto {
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

export class UpdateListDto {
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

export class ReorderListsDto {
  @IsArray()
  items: { id: string; position: number }[];
}
