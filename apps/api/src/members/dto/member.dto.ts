import { IsString, IsOptional, IsIn } from 'class-validator';

export class AddMemberDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsIn(['admin', 'member', 'viewer'])
  role?: 'admin' | 'member' | 'viewer' = 'member';
}
