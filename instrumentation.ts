import type { Instrumentation } from "next";

/**
 * Every server error — a page, a route, a server action — as one structured
 * log line (lib/log.ts): where it happened, and the digest the user sees on
 * the error page, to find the line from a report. Headers are left out: they
 * carry the session cookie.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { log } = await import("@/lib/log");
  log("error", "request_error", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 8).join("\n") : undefined,
    digest: typeof error === "object" && error && "digest" in error ? String(error.digest) : undefined,
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    kind: context.routeType,
  });
};
