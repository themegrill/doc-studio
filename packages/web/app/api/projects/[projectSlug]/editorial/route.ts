import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { checkProjectAccess } from "@/lib/project-helpers";
import {
  getGuidelines,
  getGuidelinesFresh,
  getProjectOverride,
  setProjectOverride,
} from "@/lib/editorial/config";
import { validateGuidelinesPatch } from "@/lib/editorial/config";

/**
 * Per-project editorial guideline overrides (DOCSTUDIO-45).
 *
 * DocStudio hosts documentation for several products. The 50–60 character band
 * is universal; the site-name suffix, the brand mention and the approved
 * category list are not — those belong here.
 *
 * GET returns both the raw override (for the settings form) and the effective
 * merged values (for showing what actually applies).
 */

async function resolveProject(projectSlug: string) {
  const sql = getDb();
  const [project] = await sql`SELECT id FROM projects WHERE slug = ${projectSlug}`;
  return project ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectSlug } = await params;
    const project = await resolveProject(projectSlug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!(await checkProjectAccess(session.user.id, project.id, "viewer"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      override: await getProjectOverride(projectSlug),
      guidelines: await getGuidelines(projectSlug),
    });
  } catch (error) {
    console.error("[GET /api/projects/:slug/editorial] Error:", error);
    return NextResponse.json(
      { error: "Failed to load editorial guidelines" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectSlug } = await params;
    const project = await resolveProject(projectSlug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!(await checkProjectAccess(session.user.id, project.id, "admin"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const patch = body?.override ?? body;
    const parsed = validateGuidelinesPatch(patch);

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

    const override = await setProjectOverride(
      projectSlug,
      parsed.data as Record<string, unknown>,
    );

    return NextResponse.json({
      override,
      guidelines: await getGuidelinesFresh(projectSlug),
    });
  } catch (error) {
    console.error("[PATCH /api/projects/:slug/editorial] Error:", error);
    return NextResponse.json(
      { error: "Failed to save editorial guidelines" },
      { status: 500 },
    );
  }
}

/** Clear the project override so it inherits the org-wide defaults again. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectSlug } = await params;
    const project = await resolveProject(projectSlug);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!(await checkProjectAccess(session.user.id, project.id, "admin"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sql = getDb();
    await sql`
      UPDATE projects
      SET settings = COALESCE(settings, '{}'::jsonb) - 'editorialGuidelines',
          updated_at = NOW()
      WHERE slug = ${projectSlug}
    `;

    return NextResponse.json({
      override: {},
      guidelines: await getGuidelinesFresh(projectSlug),
    });
  } catch (error) {
    console.error("[DELETE /api/projects/:slug/editorial] Error:", error);
    return NextResponse.json(
      { error: "Failed to reset editorial guidelines" },
      { status: 500 },
    );
  }
}
