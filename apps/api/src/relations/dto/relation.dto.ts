import { IsString, IsIn, IsOptional } from 'class-validator';

export class CreateRelationDto {
  @IsString()
  otherTaskId: string;

  @IsIn(['blocks', 'related_to'])
  type: 'blocks' | 'related_to';

  /**
   * For "blocks": 'source' (default) means the URL task blocks the other task;
   * 'target' means the URL task is blocked by the other task. Ignored for
   * "related_to" (undirected, canonicalized).
   */
  @IsOptional()
  @IsIn(['source', 'target'])
  direction?: 'source' | 'target';
}