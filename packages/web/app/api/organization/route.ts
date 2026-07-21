import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextResponse } from "next/server";

const SETTINGS_KEY = "organization.config";
const SETTINGS_CATEGORY = "organization";

interface OrganizationConfig {
  name: string;
  logo: string;
  url: string;
}

const DEFAULTS: OrganizationConfig = { name: "", logo: "", url: "" };

/**
 * Public organization identity (name/logo/url), shared across all projects.
 * Read is public — the client-facing docs sites fetch this unauthenticated
 * to build schema.org Organization/WebSite JSON-LD.
 */
export async function GET() {
  const sql = getDb();

  const [row] = await sql`
    SELECT value FROM global_settings WHERE key = ${SETTINGS_KEY}
  `;

  const config = { ...DEFAULTS, ...(row?.value as Partial<OrganizationConfig> | undefined) };

  return NextResponse.json(config);
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
  const { name, logo, url } = body as Partial<OrganizationConfig>;

  const value = {
    name: (name ?? "").trim(),
    logo: (logo ?? "").trim(),
    url: (url ?? "").trim(),
  };

  await sql`
    INSERT INTO global_settings (key, value, category, description, updated_at)
    VALUES (
      ${SETTINGS_KEY},
      ${sql.json(value)},
      ${SETTINGS_CATEGORY},
      'Shared organization identity (name/logo/url) used across all projects for schema.org JSON-LD',
      NOW()
    )
    ON CONFLICT (key)
    DO UPDATE SET
      value      = ${sql.json(value)},
      updated_at = NOW()
  `;

  return NextResponse.json({ success: true });
}
