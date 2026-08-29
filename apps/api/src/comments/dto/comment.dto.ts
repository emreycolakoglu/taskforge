import { IsString, IsOptional } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  taskId: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsString()
  body: string;
}

export class UpdateCommentDto {
  @IsString()
  body: string;
}

export class ReactDto {
  @IsString()
  emoji: string;
}
