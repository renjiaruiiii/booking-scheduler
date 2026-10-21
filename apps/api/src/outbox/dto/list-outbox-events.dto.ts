import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class ListOutboxEventsDto {
  @IsOptional()
  @Matches(/^\d+$/)
  page?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  pageSize?: string;

  @IsOptional()
  @IsIn(["PENDING", "PROCESSING", "COMPLETED", "FAILED"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  aggregateType?: string;
}
