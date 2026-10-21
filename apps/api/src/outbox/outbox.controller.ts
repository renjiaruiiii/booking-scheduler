import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ListOutboxEventsDto } from "./dto/list-outbox-events.dto";
import { OutboxService } from "./outbox.service";

@Controller("outbox-events")
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles("SYSTEM_ADMIN")
export class OutboxController {
  constructor(private readonly outboxService: OutboxService) {}

  @Get()
  list(@Query() query: ListOutboxEventsDto) {
    return this.outboxService.list(query);
  }
}
