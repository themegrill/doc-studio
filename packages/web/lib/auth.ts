import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PostgresAdapter } from "@/lib/auth/adapter";
import { getDb } from "@/lib/db/postgres";
import bcrypt from "bcryptjs";

export const authConfig: NextAuthConfig = {
  adapter: PostgresAdapter(),
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const sql = getDb();
        const [user] = await sql`
          SELECT id, email, name, hashed_password, image
          FROM users
          WHERE email = ${credentials.email as string}
        `;

        if (!user || !user.hashed_password) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.hashed_password,
        );

        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Initial sign in - populate token with user data
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }

      // Handle session updates from client-side update() calls
      if (trigger === "update" && token.id) {
        try {
          const sql = getDb();
          const [dbUser] = await sql`
            SELECT id, email, name, image
            FROM users
            WHERE id = ${token.id as string}
          `;

          if (dbUser) {
            token.email = dbUser.email;
            token.name = dbUser.name;
            token.picture = dbUser.image;
          }
        } catch (error) {
          // Silent fail - continue with existing token data
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
