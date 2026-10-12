import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns a healthy API status", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    const result = moduleRef.get(HealthController).getHealth();
    expect(result.status).toBe("ok");
    expect(result.service).toBe("api");
  });
});
