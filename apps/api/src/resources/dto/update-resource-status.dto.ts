import { ResourceStatus } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateResourceStatusDto {
  @IsEnum(ResourceStatus)
  status!: ResourceStatus;
}
