# 可配置预约与资源排期系统

当前源码已实现项目骨架、MySQL/Redis 基础设施、Prisma 用户角色基础表、Prisma Client 接入、NestJS 配置接入，以及用户注册、Access Token 登录和 Refresh Token 轮换/退出撤销。

当前认证已包含 Access Token Guard 和受保护的当前用户接口；RBAC Guard、资源、排期和预约业务尚未实现。

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
