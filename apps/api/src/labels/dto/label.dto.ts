import { IsString, IsOptional } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  boardId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;
}
