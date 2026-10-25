import http from "k6/http";
import { check, sleep } from "k6";

const method = (__ENV.METHOD || "GET").toUpperCase();
const path = __ENV.TARGET_PATH || "/api/v1/health";
const body = __ENV.BODY || null;
const token = __ENV.TOKEN || "";
const extraHeaders = __ENV.HEADERS ? JSON.parse(__ENV.HEADERS) : {};
const sleepSeconds = Number(__ENV.SLEEP_SECONDS || 1);

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || "15s",
};

export default function () {
  const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
  const headers = {
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
  const response = http.request(method, `${baseUrl}${path}`, body, {
    headers,
  });
  check(response, {
    "endpoint returns a 2xx response": (result) =>
      result.status >= 200 && result.status < 300,
  });
  if (sleepSeconds > 0) sleep(sleepSeconds);
}
