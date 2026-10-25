import { validateEnvironment } from "./env.validation";

const validEnvironment = {
  DATABASE_URL: "mysql://app:password@localhost:3307/booking_scheduler",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "access-secret",
  JWT_REFRESH_SECRET: "refresh-secret",
};

describe("validateEnvironment", () => {
  it("normalizes ports and supplies the development environment", () => {
    const result = validateEnvironment({
      ...validEnvironment,
      API_PORT: "3000",
      WEB_PORT: "5173",
    });

    expect(result.API_PORT).toBe(3000);
    expect(result.WEB_PORT).toBe(5173);
    expect(result.NODE_ENV).toBe("development");
  });

  it("rejects an invalid API port", () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, API_PORT: "70000" }),
    ).toThrow("API_PORT must be an integer between 1 and 65535");
  });

  it("normalizes and validates rate-limit settings", () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        RATE_LIMIT_MAX: "60",
        RATE_LIMIT_WINDOW_SECONDS: "30",
      }),
    ).toMatchObject({ RATE_LIMIT_MAX: 60, RATE_LIMIT_WINDOW_SECONDS: 30 });
    expect(() =>
      validateEnvironment({ ...validEnvironment, RATE_LIMIT_MAX: "0" }),
    ).toThrow("RATE_LIMIT_MAX must be a positive integer");
  });
});
