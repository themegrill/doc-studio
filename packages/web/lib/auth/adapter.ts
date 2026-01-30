import { Adapter } from "next-auth/adapters";
import { getDb } from "@/lib/db/postgres";

/**
 * Custom PostgreSQL adapter for NextAuth.js v5
 * Uses the postgres library for direct database access
 */
export function PostgresAdapter(): Adapter {
  const sql = getDb();

  return {
    async createUser(user) {
      const [newUser] = await sql`
        INSERT INTO users (name, email, email_verified, image)
        VALUES (${user.name || null}, ${user.email}, ${user.emailVerified || null}, ${user.image || null})
        RETURNING id, name, email, email_verified, image, created_at, updated_at
      `;
      return {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        emailVerified: newUser.email_verified,
        image: newUser.image,
      };
    },

    async getUser(id) {
      const [user] = await sql`
        SELECT id, name, email, email_verified, image
        FROM users
        WHERE id = ${id}
      `;
      if (!user) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.email_verified,
        image: user.image,
      };
    },

    async getUserByEmail(email) {
      const [user] = await sql`
        SELECT id, name, email, email_verified, image
        FROM users
        WHERE email = ${email}
      `;
      if (!user) return null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.email_verified,
        image: user.image,
      };
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const [account] = await sql`
        SELECT u.id, u.name, u.email, u.email_verified, u.image
        FROM users u
        JOIN accounts a ON u.id = a.user_id
        WHERE a.provider = ${provider}
          AND a.provider_account_id = ${providerAccountId}
      `;
      if (!account) return null;
      return {
        id: account.id,
        name: account.name,
        email: account.email,
        emailVerified: account.email_verified,
        image: account.image,
      };
    },

    async updateUser(user) {
      const [updatedUser] = await sql`
        UPDATE users
        SET
          name = ${user.name || null},
          email = ${user.email || null},
          email_verified = ${user.emailVerified || null},
          image = ${user.image || null}
        WHERE id = ${user.id}
        RETURNING id, name, email, email_verified, image
      `;
      return {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        emailVerified: updatedUser.email_verified,
        image: updatedUser.image,
      };
    },

    async deleteUser(userId) {
      await sql`DELETE FROM users WHERE id = ${userId}`;
    },

    async linkAccount(account) {
      const refreshToken = account.refresh_token || null;
      const accessToken = account.access_token || null;
      const expiresAt = account.expires_at || null;
      const tokenType = account.token_type || null;
      const scope = account.scope || null;
      const idToken = account.id_token || null;
      const sessionState = account.session_state || null;

      await sql`
        INSERT INTO accounts (
          user_id, type, provider, provider_account_id,
          refresh_token, access_token, expires_at, token_type,
          scope, id_token, session_state
        )
        VALUES (
          ${account.userId}, ${account.type}, ${account.provider},
          ${account.providerAccountId}, ${refreshToken},
          ${accessToken}, ${expiresAt},
          ${tokenType}, ${scope},
          ${idToken}, ${sessionState}
        )
      `;
    },

    async unlinkAccount({ providerAccountId, provider }) {
      await sql`
        DELETE FROM accounts
        WHERE provider = ${provider}
          AND provider_account_id = ${providerAccountId}
      `;
    },

    async createSession({ sessionToken, userId, expires }) {
      const [session] = await sql`
        INSERT INTO sessions (session_token, user_id, expires)
        VALUES (${sessionToken}, ${userId}, ${expires})
        RETURNING id, session_token, user_id, expires
      `;
      return {
        sessionToken: session.session_token,
        userId: session.user_id,
        expires: session.expires,
      };
    },

    async getSessionAndUser(sessionToken) {
      const [result] = await sql`
        SELECT
          s.session_token, s.user_id, s.expires,
          u.id, u.name, u.email, u.email_verified, u.image
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.session_token = ${sessionToken}
      `;

      if (!result) return null;

      return {
        session: {
          sessionToken: result.session_token,
          userId: result.user_id,
          expires: result.expires,
        },
        user: {
          id: result.id,
          name: result.name,
          email: result.email,
          emailVerified: result.email_verified,
          image: result.image,
        },
      };
    },

    async updateSession({ sessionToken, expires, userId }) {
      const [session] = await sql`
        UPDATE sessions
        SET
          expires = COALESCE(${expires || null}, expires),
          user_id = COALESCE(${userId || null}, user_id)
        WHERE session_token = ${sessionToken}
        RETURNING session_token, user_id, expires
      `;
      if (!session) return null;
      return {
        sessionToken: session.session_token,
        userId: session.user_id,
        expires: session.expires,
      };
    },

    async deleteSession(sessionToken) {
      await sql`DELETE FROM sessions WHERE session_token = ${sessionToken}`;
    },

    async createVerificationToken({ identifier, expires, token }) {
      const [verificationToken] = await sql`
        INSERT INTO verification_tokens (identifier, token, expires)
        VALUES (${identifier}, ${token}, ${expires})
        RETURNING identifier, token, expires
      `;
      return {
        identifier: verificationToken.identifier,
        token: verificationToken.token,
        expires: verificationToken.expires,
      };
    },

    async useVerificationToken({ identifier, token }) {
      const [verificationToken] = await sql`
        DELETE FROM verification_tokens
        WHERE identifier = ${identifier} AND token = ${token}
        RETURNING identifier, token, expires
      `;
      if (!verificationToken) return null;
      return {
        identifier: verificationToken.identifier,
        token: verificationToken.token,
        expires: verificationToken.expires,
      };
    },
  };
}
