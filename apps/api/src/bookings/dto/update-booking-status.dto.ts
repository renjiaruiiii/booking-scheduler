import { IsEnum } from "class-validator";

export enum ManageBookingStatus {
  CONFIRMED = "CONFIRMED",
  REJECTED = "REJECTED",
  COMPLETED = "COMPLETED",
}

export class UpdateBookingStatusDto {
  @IsEnum(ManageBookingStatus)
  status!: ManageBookingStatus;
}
