import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { verifyCredentials } from "@/lib/domain/users/service";
import { clearFailures, clientIp, recordFailure, signInAllowed } from "@/lib/auth/rate-limit";
import { log } from "@/lib/log";

/** Too many wrong passwords lately (lib/auth/rate-limit.ts): refused before checking. */
export class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Every sign-in comes through here — the form's action and the auth API alike — so the limit holds for both.
      async authorize(rawCredentials, request) {
        const email = typeof rawCredentials?.email === "string" ? rawCredentials.email : "";
        const ip = clientIp(request.headers);
        if (!(await signInAllowed(email, ip))) {
          log("warn", "signin_throttled", { ip });
          throw new TooManyAttempts();
        }
        const user = await verifyCredentials(rawCredentials);
        if (!user) {
          // A spike of these is credential stuffing (docs/13-observability.md #alerting).
          log("info", "signin_failed", { ip });
          await recordFailure(email, ip);
          return null;
        }
        await clearFailures(email, ip);
        return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
      },
    }),
  ],
});
