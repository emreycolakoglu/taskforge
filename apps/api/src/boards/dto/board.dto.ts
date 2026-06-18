import { IsString, IsOptional, IsNumber, IsNotEmpty, Matches } from 'class-validator';

export class CreateBoardDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  slug: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3}$/, { message: 'Identifier must be exactly 3 uppercase letters' })
  identifier: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateBoardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'Identifier must be exactly 3 uppercase letters' })
  identifier?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
