import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { checkProjectAccess } from "@/lib/project-helpers";
import { findMetaDuplicates } from "@/lib/editorial/duplicates";
import { getGuidelines } from "@/lib/editorial/config";

/**
 * Meta title/description uniqueness check for the editor (DOCSTUDIO-45 §4).
 *
 * Uniqueness is the one editorial rule a writer cannot verify by hand, because
 * it needs a lookup across every other article. The editor calls this as the
 * meta fields settle and folds the result into the same checklist as the
 * client-side rules.
 */
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
    const sql = getDb();
    const [project] = await sql`SELECT id FROM projects WHERE slug = ${projectSlug}`;

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!(await checkProjectAccess(session.user.id, project.id, "viewer"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = request.nextUrl.searchParams;
    const guidelines = await getGuidelines(projectSlug);

    const duplicates = await findMetaDuplicates({
      projectId: project.id,
      slug: search.get("slug") ?? "",
      metaTitle: search.get("metaTitle"),
      metaDescription: search.get("metaDescription"),
      scope: guidelines.duplicateScope,
    });

    return NextResponse.json({ duplicates });
  } catch (error) {
    console.error("[GET /api/projects/:slug/seo-duplicates] Error:", error);
    // Advisory only — never surface a failure as an editor error.
    return NextResponse.json({
      duplicates: { metaTitle: null, metaDescription: null },
    });
  }
}
