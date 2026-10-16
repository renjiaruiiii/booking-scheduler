import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateResourceUnavailableDateDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
