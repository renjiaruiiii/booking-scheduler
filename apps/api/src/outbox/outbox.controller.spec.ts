import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { OutboxController } from "./outbox.controller";
import { OutboxService } from "./outbox.service";

describe("OutboxController (HTTP)", () => {
  const outboxService = { list: jest.fn() };
  let app: Awaited<ReturnType<typeof createApp>>;
  let port: number;
  let jwtService: JwtService;

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "booking-api-test-secret" })],
      controllers: [OutboxController],
      providers: [
        { provide: OutboxService, useValue: outboxService },
        AccessTokenGuard,
        RolesGuard,
        Reflector,
      ],
    }).compile();

    const testApp = moduleRef.createNestApplication();
    testApp.setGlobalPrefix("api/v1");
    testApp.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await testApp.listen(0, "127.0.0.1");
    return testApp;
  }

  async function send(path: string, roles?: string[]) {
    const token = roles
      ? await jwtService.signAsync({ sub: 7, username: "honey", roles })
      : undefined;

    return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          method: "GET",
          path: `/api/v1${path}`,
          headers: token ? { authorization: `Bearer ${token}` } : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({
              status: res.statusCode ?? 0,
              body: text ? JSON.parse(text) : undefined,
            });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  beforeAll(async () => {
    app = await createApp();
    port = (app.getHttpServer().address() as AddressInfo).port;
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it("requires a system administrator role", async () => {
    expect((await send("/outbox-events")).status).toBe(401);
    expect((await send("/outbox-events", ["USER"])).status).toBe(403);
    expect((await send("/outbox-events", ["RESOURCE_ADMIN"])).status).toBe(403);
    expect(outboxService.list).not.toHaveBeenCalled();
  });

  it("passes validated filters to the Outbox service", async () => {
    outboxService.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    expect(
      (
        await send(
          "/outbox-events?page=1&pageSize=20&status=FAILED&eventType=BookingCreated&aggregateType=BOOKING",
          ["SYSTEM_ADMIN"],
        )
      ).status,
    ).toBe(200);
    expect(outboxService.list).toHaveBeenCalledWith({
      page: "1",
      pageSize: "20",
      status: "FAILED",
      eventType: "BookingCreated",
      aggregateType: "BOOKING",
    });
  });

  it("rejects unsupported event statuses before calling the service", async () => {
    expect(
      (await send("/outbox-events?status=UNKNOWN", ["SYSTEM_ADMIN"])).status,
    ).toBe(400);
    expect(outboxService.list).not.toHaveBeenCalled();
  });
});
