import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class ListOperationLogsDto {
  @IsOptional()
  @Matches(/^\d+$/)
  page?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  pageSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  targetType?: string;
}
