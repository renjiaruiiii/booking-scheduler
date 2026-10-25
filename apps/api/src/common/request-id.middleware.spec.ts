import { RequestIdMiddleware } from "./request-id.middleware";
import type { RequestWithId } from "./request-id.middleware";
import type { NextFunction, Response } from "express";

describe("RequestIdMiddleware", () => {
  it("keeps a valid incoming request id and writes it to the response", () => {
    const middleware = new RequestIdMiddleware();
    const request = {
      header: jest.fn().mockReturnValue("client-request-1"),
    } as unknown as RequestWithId;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware.use(request, response, next);

    expect(request.requestId).toBe("client-request-1");
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Request-Id",
      "client-request-1",
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("replaces an invalid or missing request id", () => {
    const middleware = new RequestIdMiddleware();
    const request = {
      header: jest.fn().mockReturnValue("bad id"),
    } as unknown as RequestWithId;
    const response = { setHeader: jest.fn() } as unknown as Response;

    middleware.use(request, response, jest.fn());

    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.setHeader).toHaveBeenCalledWith(
      "X-Request-Id",
      request.requestId,
    );
  });
});
