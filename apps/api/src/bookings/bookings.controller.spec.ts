import { NotFoundException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { ManageBookingStatus } from "./dto/update-booking-status.dto";

describe("BookingsController (HTTP)", () => {
  const bookingsService = {
    listManaged: jest.fn(),
    getManagedStats: jest.fn(),
    getMine: jest.fn(),
    cancelMine: jest.fn(),
    updateManagedStatus: jest.fn(),
  };
  let app: Awaited<ReturnType<typeof createApp>>;
  let port: number;
  let jwtService: JwtService;

  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "booking-api-test-secret" })],
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: bookingsService },
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

  async function send(
    method: string,
    path: string,
    roles?: string[],
    body?: unknown,
  ) {
    const token = roles
      ? await jwtService.signAsync({ sub: 7, username: "honey", roles })
      : undefined;
    const payload = body === undefined ? undefined : JSON.stringify(body);

    return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          method,
          path: `/api/v1${path}`,
          headers: {
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(payload ? { "content-type": "application/json" } : {}),
          },
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
      if (payload) req.write(payload);
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

  it("requires authentication and a manager role for managed bookings", async () => {
    expect((await send("GET", "/bookings/manage")).status).toBe(401);
    expect((await send("GET", "/bookings/manage", ["USER"])).status).toBe(403);
    expect(bookingsService.listManaged).not.toHaveBeenCalled();
  });

  it("passes resource-admin scope and system-admin access to the service", async () => {
    bookingsService.listManaged.mockResolvedValue({ items: [], total: 0 });

    expect(
      (await send("GET", "/bookings/manage", ["RESOURCE_ADMIN"])).status,
    ).toBe(200);
    expect(bookingsService.listManaged).toHaveBeenLastCalledWith(
      expect.any(Object),
      7,
      false,
    );

    expect(
      (await send("GET", "/bookings/manage", ["SYSTEM_ADMIN"])).status,
    ).toBe(200);
    expect(bookingsService.listManaged).toHaveBeenLastCalledWith(
      expect.any(Object),
      7,
      true,
    );
  });

  it("limits managed stats to manager roles", async () => {
    bookingsService.getManagedStats.mockResolvedValue({
      total: 0,
      byStatus: {},
    });

    expect((await send("GET", "/bookings/manage/stats", ["USER"])).status).toBe(
      403,
    );
    expect(
      (await send("GET", "/bookings/manage/stats", ["RESOURCE_ADMIN"])).status,
    ).toBe(200);
    expect(bookingsService.getManagedStats).toHaveBeenCalledWith(7, false);
  });

  it("restricts users to their own booking when reading or cancelling", async () => {
    bookingsService.getMine.mockRejectedValue(new NotFoundException());
    bookingsService.cancelMine.mockRejectedValue(new NotFoundException());

    expect((await send("GET", "/bookings/12", ["USER"])).status).toBe(404);
    expect(bookingsService.getMine).toHaveBeenCalledWith(12, 7);
    expect((await send("DELETE", "/bookings/12", ["USER"])).status).toBe(404);
    expect(bookingsService.cancelMine).toHaveBeenCalledWith(12, 7);
  });

  it("validates status input and forwards an allowed transition", async () => {
    bookingsService.updateManagedStatus.mockResolvedValue({
      id: 12,
      status: "CONFIRMED",
    });

    expect(
      (
        await send("PATCH", "/bookings/12/status", ["RESOURCE_ADMIN"], {
          status: "CANCELLED",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("PATCH", "/bookings/12/status", ["RESOURCE_ADMIN"], {
          status: ManageBookingStatus.CONFIRMED,
        })
      ).status,
    ).toBe(200);
    expect(bookingsService.updateManagedStatus).toHaveBeenCalledWith(
      12,
      ManageBookingStatus.CONFIRMED,
      7,
      false,
    );
  });
});
