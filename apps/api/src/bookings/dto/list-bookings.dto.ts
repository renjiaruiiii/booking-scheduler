import { IsOptional, Matches } from "class-validator";

export class ListBookingsDto {
  @IsOptional()
  @Matches(/^\d+$/)
  page?: string;

  @IsOptional()
  @Matches(/^\d+$/)
  pageSize?: string;
}
