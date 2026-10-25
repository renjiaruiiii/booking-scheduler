import { BadRequestException } from "@nestjs/common";
import { HttpExceptionFilter } from "./http-exception.filter";

describe("HttpExceptionFilter", () => {
  it("returns a stable error shape with the request id", () => {
    const filter = new HttpExceptionFilter();
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }) };
    const request = {
      originalUrl: "/api/v1/resources",
      requestId: "req-1",
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as never;

    filter.catch(new BadRequestException("参数错误"), host);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: "参数错误",
        path: "/api/v1/resources",
        requestId: "req-1",
      }),
    );
  });
});
