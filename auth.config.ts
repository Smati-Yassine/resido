import type { NextAuthConfig } from "next-auth";

/** Pages only for signed-out visitors: a signed-in user is sent to their residences instead. */
const PUBLIC_ONLY = ["/", "/privacy", "/terms"];
/** Everything under this prefix needs a session. */
const PRIVATE_PREFIX = "/residences";

export const HOME_SIGNED_IN = "/residences";

/**
 * Edge-safe config (no MongoDB/bcrypt imports here) consumed by proxy.ts for
 * route-level gating. The credentials provider itself, which does hit the
 * database, is added in auth.ts. The session only identifies the user: which
 * residences they can open, and with which role, is resolved per request
 * from their memberships (lib/session.ts). See docs/07-auth-security.md.
 *
 * Any other path (an unknown URL) is let through so it reaches the 404 page,
 * which itself adapts to whether the visitor is signed in.
 */
export const authConfig = {
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const signedIn = !!auth?.user;
      if (signedIn && PUBLIC_ONLY.includes(pathname)) {
        return Response.redirect(new URL(HOME_SIGNED_IN, request.nextUrl));
      }
      if (!signedIn && (pathname === PRIVATE_PREFIX || pathname.startsWith(`${PRIVATE_PREFIX}/`))) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        token.sessionVersion = user.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      session.user.sessionVersion = typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
      return session;
    },
  },
  logger: {
    // A wrong password is an expected outcome (shown as a toast), not a server error.
    error(error) {
      if (error.name === "CredentialsSignin") return;
      console.error(error);
    },
  },
  providers: [], // populated in auth.ts
} satisfies NextAuthConfig;
