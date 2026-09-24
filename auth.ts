import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { verifyCredentials } from "@/lib/domain/users/service";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const user = await verifyCredentials(rawCredentials);
        return user ? { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion } : null;
      },
    }),
  ],
});
