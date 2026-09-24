import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      /** The account's sessionVersion when this session was issued (see lib/domain/users/service). */
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    sessionVersion: number;
  }
}
