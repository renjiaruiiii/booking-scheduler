import { ArrayMinSize, ArrayUnique, IsArray, IsEnum } from "class-validator";

export enum UserRoleCode {
  USER = "USER",
  RESOURCE_ADMIN = "RESOURCE_ADMIN",
  SYSTEM_ADMIN = "SYSTEM_ADMIN",
}

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(UserRoleCode, { each: true })
  roles!: UserRoleCode[];
}
