import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_-]+$/)
  @MinLength(2)
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
