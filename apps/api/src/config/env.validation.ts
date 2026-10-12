type Environment = Record<string, unknown>;

export function validateEnvironment(config: Environment) {
  const apiPort = Number(config.API_PORT ?? 3000);
  const webPort = Number(config.WEB_PORT ?? 5173);

  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }

  if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
    throw new Error("WEB_PORT must be an integer between 1 and 65535");
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
  };
}
