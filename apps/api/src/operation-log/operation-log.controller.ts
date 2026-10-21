import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ListOperationLogsDto } from "./dto/list-operation-logs.dto";
import { OperationLogService } from "./operation-log.service";

@Controller("operation-logs")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("SYSTEM_ADMIN")
export class OperationLogController {
  constructor(private readonly operationLogService: OperationLogService) {}

  @Get()
  list(@Query() query: ListOperationLogsDto) {
    return this.operationLogService.list(query);
  }
}
