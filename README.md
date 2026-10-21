# 可配置预约与资源排期系统

当前源码已实现项目骨架、MySQL/Redis 基础设施、Prisma 用户角色、Refresh Token、资源和每周规则模型、Prisma Client 接入、NestJS 配置接入，以及用户注册、Access Token 登录和 Refresh Token 轮换/退出撤销。资源 API 支持启用资源查询、创建、编辑和启用/停用。

当前认证已包含 Access Token Guard、RBAC 角色 Guard 和受保护的当前用户接口；资源写操作受 `RESOURCE_ADMIN` / `SYSTEM_ADMIN` 角色保护，资源管理员只能管理自己创建的资源。每周规则、不可预约日期和时间片 API 已实现。预约创建、我的预约列表和详情、用户取消自己的待确认或已确认预约，以及管理员预约列表和状态流转 API 已实现。
前端提供公开资源浏览、按日期查询可预约时间片和登录后提交预约的页面；管理员可在资源管理页维护资源和每周预约规则，在预约管理页查看统计、分页列表并处理预约状态。

## 环境

- Node.js 22+
- pnpm 10+
- Docker Desktop（用于 MySQL 和 Redis；当前环境若未安装 Docker，可先本地运行 API 和前端）

## 安装依赖

```bash
pnpm install
```

## 启动基础设施

```bash
docker compose -p booking-scheduler up -d
```

MySQL 使用宿主机端口 `3307`，Redis 使用 `6379`。凭据仅存在于本地 Compose 配置和 `.env.example` 的示例值中。

## 启动 API 和前端

```bash
pnpm dev:api
pnpm dev:web
```

- API 健康检查：`http://localhost:3000/api/v1/health`
- 前端页面：`http://localhost:5173`

## 验证

```bash
pnpm typecheck
pnpm lint
pnpm --filter @booking/api test
```

Refresh Token 通过 HttpOnly Cookie 传递并以哈希形式存储。开发环境使用 SameSite=Strict；生产环境还要求 HTTPS，以启用 Secure Cookie。

认证接口：

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me (Bearer Access Token)
```

角色标识为 `USER`、`RESOURCE_ADMIN`、`SYSTEM_ADMIN`。当前注册用户默认获得 `USER`；角色分配管理接口尚未实现。

资源接口：

```text
GET   /api/v1/resources?page=1&pageSize=20&keyword=ROOM
GET   /api/v1/resources/:id
GET   /api/v1/resources/manage (RESOURCE_ADMIN / SYSTEM_ADMIN)
POST  /api/v1/resources (RESOURCE_ADMIN / SYSTEM_ADMIN)
PATCH /api/v1/resources/:id (RESOURCE_ADMIN / SYSTEM_ADMIN)
PATCH /api/v1/resources/:id/status (RESOURCE_ADMIN / SYSTEM_ADMIN)
GET   /api/v1/resources/:resourceId/rules (RESOURCE_ADMIN / SYSTEM_ADMIN)
POST  /api/v1/resources/:resourceId/rules (RESOURCE_ADMIN / SYSTEM_ADMIN)
PATCH /api/v1/resources/:resourceId/rules/:ruleId (RESOURCE_ADMIN / SYSTEM_ADMIN)
DELETE /api/v1/resources/:resourceId/rules/:ruleId (RESOURCE_ADMIN / SYSTEM_ADMIN)
GET   /api/v1/resources/:resourceId/unavailable-dates (RESOURCE_ADMIN / SYSTEM_ADMIN)
POST  /api/v1/resources/:resourceId/unavailable-dates (RESOURCE_ADMIN / SYSTEM_ADMIN)
DELETE /api/v1/resources/:resourceId/unavailable-dates/:dateId (RESOURCE_ADMIN / SYSTEM_ADMIN)
POST  /api/v1/resources/:resourceId/slots/generate (RESOURCE_ADMIN / SYSTEM_ADMIN)
GET   /api/v1/resources/:resourceId/slots?date=2026-10-19
POST  /api/v1/bookings
GET   /api/v1/bookings?page=1&pageSize=20
GET   /api/v1/bookings/:id
DELETE /api/v1/bookings/:id
GET   /api/v1/bookings/manage?page=1&pageSize=20 (RESOURCE_ADMIN / SYSTEM_ADMIN)
GET   /api/v1/bookings/manage/stats (RESOURCE_ADMIN / SYSTEM_ADMIN)
PATCH /api/v1/bookings/:id/status (RESOURCE_ADMIN / SYSTEM_ADMIN)
GET   /api/v1/operation-logs?page=1&pageSize=20&action=BOOKING_STATUS_CHANGED&targetType=BOOKING (SYSTEM_ADMIN)
GET   /api/v1/outbox-events?page=1&pageSize=20&status=FAILED&eventType=BookingCreated (SYSTEM_ADMIN)
GET   /api/v1/users/manage?page=1&pageSize=20&keyword=admin&status=ACTIVE (SYSTEM_ADMIN)
PATCH /api/v1/users/manage/:id/status (SYSTEM_ADMIN)
PATCH /api/v1/users/manage/:id/roles (SYSTEM_ADMIN)
```

用户端页面：`/resources` 浏览启用资源、搜索并按日期选择可用时间片；登录后可提交预约，并在 `/bookings` 查看和取消自己的预约。管理员资源页：`/admin/resources`，可维护资源、每周规则、不可预约日期并按日期生成时间片；管理员预约页：`/admin/bookings`；系统管理员用户页：`/admin/users`，日志页：`/admin/operation-logs`，Outbox 事件页：`/admin/outbox`。

公开资源列表和详情只返回启用资源。管理列表包含停用资源，资源管理员仅能看到自己创建的资源，系统管理员可以查看全部；分页大小最大为 100。资源编码仅允许大写字母、数字、下划线和连字符。

每周规则的 `weekday` 使用 `0` 到 `6`（周日到周六）；时间使用 `HH:mm`，日期使用 `YYYY-MM-DD`。规则管理仅允许资源管理员管理自己创建的资源，或系统管理员管理任意资源。

时间片生成会读取指定日期对应的规则，跳过不可预约日期，按规则切分并通过事务同步时间片；规则变更后会删除不再匹配且仍为 `AVAILABLE` 的旧时间片，更新同一开始时间的可用片，并补充新片。已预约的 `BOOKED` 时间片和 `BLOCKED` 时间片不会被删除。
可预约时间片查询只返回 `AVAILABLE` 状态，并按开始时间升序排列；资源未启用或不存在时返回 `404`。

创建预约会在事务中原子占用全部时间片；请求体支持可选 `idempotencyKey`，重复提交相同用户和幂等键会返回原预约。
用户只能取消自己的待确认或已确认预约；取消会在事务中将预约设为 `CANCELLED` 并释放关联时间片。
管理员只能处理自己管理资源的预约；`PENDING` 可确认或拒绝，`CONFIRMED` 可标记为 `COMPLETED`，拒绝会释放时间片。
管理统计接口返回授权范围内的预约总量及 `PENDING`、`CONFIRMED`、`CANCELLED`、`REJECTED`、`COMPLETED` 状态数量；资源管理员仅统计自己创建资源的数据。

操作日志查询仅允许系统管理员访问，支持按 `action` 和 `targetType` 筛选并分页返回操作人摘要。
用户管理列表仅允许系统管理员访问，支持按用户名或邮箱关键词、用户状态筛选，并返回用户角色摘要。
系统管理员可以启用或停用用户；停用操作会记录操作日志，不能停用当前登录账号。
系统管理员可以为其他用户设置 `USER`、`RESOURCE_ADMIN`、`SYSTEM_ADMIN` 角色组合，角色集合必须保留 `USER`；角色变化会写入操作日志。角色会在用户刷新或重新登录并获得新的 Access Token 后生效，不能修改当前登录账号的角色。
创建资源会与 `RESOURCE_CREATED` 操作日志在同一事务中保存。
资源启用或停用会与 `RESOURCE_STATUS_CHANGED` 操作日志在同一事务中保存。
编辑资源会与 `RESOURCE_UPDATED` 操作日志在同一事务中保存，记录发生变化的字段名。
新增、修改和删除每周预约规则分别写入 `RESOURCE_RULE_CREATED`、`RESOURCE_RULE_UPDATED` 和 `RESOURCE_RULE_DELETED` 操作日志，并与规则变更在同一事务中保存。修改日志保留前后规则摘要，删除日志保留被删规则摘要；管理日志页以中文显示规则时间、生效日期和修改字段。

预约创建、取消和管理员状态变更会在业务事务中写入 Outbox 事件；后台轮询投递到 BullMQ，采用指数退避最多重试 3 次。队列发布失败会将事件恢复为 `PENDING`，消费成功标记为 `COMPLETED`，重试耗尽标记为 `FAILED`；应用重启时会重新投递遗留的 `PROCESSING` 事件。
系统管理员可通过 `/api/v1/outbox-events` 分页查看 Outbox 事件，并按状态、事件类型和聚合类型筛选失败任务。
