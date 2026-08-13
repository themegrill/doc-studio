import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import {
  getGuidelines,
  getGuidelinesFresh,
  setGlobalGuidelines,
  validateGuidelinesPatch,
} from "@/lib/editorial/config";

/**
 * Documentation editorial guidelines (DOCSTUDIO-45).
 *
 * GET is readable by any signed-in user, because the editor needs the effective
 * ruleset to render its live hints. Pass ?projectSlug= to get the values with
 * that project's overrides applied; omit it for the org-wide defaults.
 *
 * POST writes the org-wide defaults and is admin-only. Per-project overrides are
 * written through /api/projects/[projectSlug]/editorial.
 */

async function requireAdmin(userId: string) {
  const sql = getDb();
  const [user] = await sql`SELECT role FROM users WHERE id = ${userId}`;
  return !!user && ["admin", "super_admin"].includes(user.role);
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectSlug = request.nextUrl.searchParams.get("projectSlug");
    const guidelines = await getGuidelines(projectSlug);

    return NextResponse.json({ guidelines });
  } catch (error) {
    console.error("[GET /api/settings/editorial] Error:", error);
    return NextResponse.json(
      { error: "Failed to load editorial guidelines" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!(await requireAdmin(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = validateGuidelinesPatch(body?.guidelines ?? body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: issue
            ? `${issue.path.join(".") || "value"}: ${issue.message}`
            : "Invalid guidelines",
        },
        { status: 400 },
      );
    }

    const guidelines = await setGlobalGuidelines(parsed.data);
    return NextResponse.json({ guidelines });
  } catch (error) {
    console.error("[POST /api/settings/editorial] Error:", error);
    return NextResponse.json(
      { error: "Failed to save editorial guidelines" },
      { status: 500 },
    );
  }
}

/** Reset to the built-in defaults by clearing the stored override. */
export async function DELETE() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await requireAdmin(session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sql = getDb();
    await sql`DELETE FROM global_settings WHERE key = 'editorial.guidelines'`;

    // Fresh: the cached reader still holds the row we just deleted.
    return NextResponse.json({ guidelines: await getGuidelinesFresh(null) });
  } catch (error) {
    console.error("[DELETE /api/settings/editorial] Error:", error);
    return NextResponse.json(
      { error: "Failed to reset editorial guidelines" },
      { status: 500 },
    );
  }
}
