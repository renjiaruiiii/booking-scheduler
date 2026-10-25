import { CallHandler, ExecutionContext, Logger } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { RequestLoggingInterceptor } from "./request-logging.interceptor";

describe("RequestLoggingInterceptor", () => {
  const request = {
    requestId: "req-1",
    method: "GET",
    originalUrl: "/api/v1/health",
  };
  const response = { statusCode: 200 };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("logs successful requests as JSON", () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation();
    const interceptor = new RequestLoggingInterceptor();
    const handler = { handle: () => of({ status: "ok" }) } as CallHandler;

    interceptor.intercept(context, handler).subscribe();

    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual(
      expect.objectContaining({
        type: "http_request",
        requestId: "req-1",
        statusCode: 200,
      }),
    );
  });

  it("logs unknown failures as status 500 and rethrows them", () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation();
    const interceptor = new RequestLoggingInterceptor();
    const failure = new Error("failed");
    const handler = {
      handle: () => throwError(() => failure),
    } as CallHandler;

    let receivedError: unknown;
    interceptor.intercept(context, handler).subscribe({
      error: (error: unknown) => {
        receivedError = error;
      },
    });

    expect(receivedError).toBe(failure);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual(
      expect.objectContaining({ statusCode: 500 }),
    );
  });
});
