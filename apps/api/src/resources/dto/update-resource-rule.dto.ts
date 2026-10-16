import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class UpdateResourceRuleDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  slotMinutes?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string | null;
}
