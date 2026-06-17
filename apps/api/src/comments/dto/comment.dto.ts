import { IsString } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  taskId: string;

  @IsString()
  author: string;

  @IsString()
  body: string;
}
