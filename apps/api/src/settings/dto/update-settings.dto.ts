import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEmail,
  IsArray,
  ArrayNotEmpty,
  Matches,
  Min,
  Max,
} from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  smtpHost?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number | null;

  @IsOptional()
  @IsString()
  smtpUsername?: string | null;

  @IsOptional()
  @IsString()
  smtpPassword?: string;

  @IsOptional()
  @IsEmail()
  smtpFromEmail?: string | null;

  @IsOptional()
  @IsString()
  smtpFromName?: string | null;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  // Upload endpoint's static Multer/FileInterceptor cap is 100mb — settings
  // above that would be silently ignored, so they're rejected here.
  @Max(100)
  maxFileSizeMb?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Matches(/^[a-z]+\/[a-z0-9.+-]+$/i, { each: true })
  allowedMimeTypes?: string[];
}
