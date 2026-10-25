type Environment = Record<string, unknown>;

export function validateEnvironment(config: Environment) {
  const apiPort = Number(config.API_PORT ?? 3000);
  const webPort = Number(config.WEB_PORT ?? 5173);
  const rateLimitMax = Number(config.RATE_LIMIT_MAX ?? 120);
  const rateLimitWindowSeconds = Number(config.RATE_LIMIT_WINDOW_SECONDS ?? 60);

  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }

  if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
    throw new Error("WEB_PORT must be an integer between 1 and 65535");
  }
  if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1) {
    throw new Error("RATE_LIMIT_MAX must be a positive integer");
  }
  if (!Number.isInteger(rateLimitWindowSeconds) || rateLimitWindowSeconds < 1) {
    throw new Error("RATE_LIMIT_WINDOW_SECONDS must be a positive integer");
  }

  for (const key of [
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
  ]) {
    if (typeof config[key] !== "string" || config[key].trim() === "") {
      throw new Error(`${key} is required`);
    }
  }

  return {
    ...config,
    NODE_ENV: config.NODE_ENV ?? "development",
    API_PORT: apiPort,
    WEB_PORT: webPort,
    RATE_LIMIT_MAX: rateLimitMax,
    RATE_LIMIT_WINDOW_SECONDS: rateLimitWindowSeconds,
  };
}
