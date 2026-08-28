import { IsString, IsIn, IsOptional } from 'class-validator';

export class CreateRelationDto {
  @IsString()
  otherTaskId: string;

  @IsIn(['blocks', 'related_to', 'duplicate_of'])
  type: 'blocks' | 'related_to' | 'duplicate_of';

  @IsOptional()
  @IsIn(['source', 'target'])
  direction?: 'source' | 'target';
}
