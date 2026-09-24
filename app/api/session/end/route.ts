import { signOut } from "@/auth";

/**
 * Clears the session cookie and returns to the sign-in page. Used when a
 * session outlives its account (lib/session#requireUser) — a Server
 * Component cannot clear cookies itself.
 */
export async function GET() {
  await signOut({ redirectTo: "/" });
}
