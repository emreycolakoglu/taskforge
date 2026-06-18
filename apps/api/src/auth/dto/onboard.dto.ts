import { IsEmail, IsString, MinLength } from 'class-validator';

export class OnboardDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  displayName: string;

  @IsString()
  title: string;
}