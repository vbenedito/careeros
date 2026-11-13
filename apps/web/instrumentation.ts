/**
 * ENV-11: unhandled errors in server rendering, route handlers and the proxy go to the Vercel
 * runtime log as one coarse JSON line (route pattern, error class, digest). No message, URL,
 * headers or params, so no personal data.
 */
import type { Instrumentation } from "next";
import { requestErrorFields } from "@/lib/error-report";
import { logServerError } from "@/lib/log";

export const onRequestError: Instrumentation.onRequestError = (error, _request, context) => {
  logServerError("request.error", requestErrorFields(error, context));
};
