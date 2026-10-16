import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

export class CreateResourceRuleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsInt()
  @Min(5)
  @Max(1440)
  slotMinutes!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo?: string;
}
