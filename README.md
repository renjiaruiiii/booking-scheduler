# 可配置预约与资源排期系统

当前源码已实现项目骨架、MySQL/Redis 基础设施、Prisma 用户角色、Refresh Token、资源和每周规则模型、Prisma Client 接入、NestJS 配置接入，以及用户注册、Access Token 登录和 Refresh Token 轮换/退出撤销。资源 API 支持启用资源查询、创建、编辑和启用/停用。

当前认证已包含 Access Token Guard、RBAC 角色 Guard 和受保护的当前用户接口；资源写操作受 `RESOURCE_ADMIN` / `SYSTEM_ADMIN` 角色保护，资源管理员只能管理自己创建的资源。每周规则、不可预约日期和时间片 API 已实现。预约创建、我的预约列表和详情 API 已实现，取消、审批和状态流转尚未实现。

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
```

公开资源列表和详情只返回启用资源。管理列表包含停用资源，资源管理员仅能看到自己创建的资源，系统管理员可以查看全部；分页大小最大为 100。资源编码仅允许大写字母、数字、下划线和连字符。

每周规则的 `weekday` 使用 `0` 到 `6`（周日到周六）；时间使用 `HH:mm`，日期使用 `YYYY-MM-DD`。规则管理仅允许资源管理员管理自己创建的资源，或系统管理员管理任意资源。

时间片生成会读取指定日期对应的规则，跳过不可预约日期，按规则切分并通过唯一约束保持幂等；生成接口不会覆盖已有时间片状态。
可预约时间片查询只返回 `AVAILABLE` 状态，并按开始时间升序排列；资源未启用或不存在时返回 `404`。

创建预约会在事务中原子占用全部时间片；请求体支持可选 `idempotencyKey`，重复提交相同用户和幂等键会返回原预约。
