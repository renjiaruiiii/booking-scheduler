import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class ListResourcesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  page?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  pageSize?: string;
}
