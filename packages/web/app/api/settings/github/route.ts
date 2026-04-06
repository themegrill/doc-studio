import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextResponse } from "next/server";

const SETTINGS_KEY = "github.config";
const SETTINGS_CATEGORY = "github";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const [user] = await sql`SELECT role FROM users WHERE id = ${session.user.id}`;
  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await sql`
    SELECT value FROM global_settings WHERE key = ${SETTINGS_KEY}
  `;

  const config = row?.value || {};

  return NextResponse.json({
    repo: (config.repo as string) || "",
    token: (config.token as string) || "",
    branch: (config.branch as string) || "main",
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const [user] = await sql`SELECT role FROM users WHERE id = ${session.user.id}`;
  if (!user || !["admin", "super_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { repo, token, branch } = body as { repo: string; token: string; branch: string };

  const value = {
    repo: (repo ?? "").trim(),
    token: (token ?? "").trim(),
    branch: (branch ?? "main").trim() || "main",
  };

  await sql`
    INSERT INTO global_settings (key, value, category, description, updated_at)
    VALUES (
      ${SETTINGS_KEY},
      ${sql.json(value)},
      ${SETTINGS_CATEGORY},
      'GitHub repository credentials for codebase knowledge base fetching',
      NOW()
    )
    ON CONFLICT (key)
    DO UPDATE SET
      value      = ${sql.json(value)},
      updated_at = NOW()
  `;

  return NextResponse.json({ success: true });
}
