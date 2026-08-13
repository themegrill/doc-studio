import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { checkProjectAccess } from "@/lib/project-helpers";
import { ContentManager } from "@/lib/db/ContentManager";
import { stripTitleHTML } from "@/lib/parse-title-badges";
import { NextRequest } from "next/server";

/**
 * List a project's sections (DOCSTUDIO-45 §4.2).
 *
 * A project's existing sections act as its approved categories unless Marketing
 * has configured an explicit list, so the editor needs to be able to read them.
 *
 * Reads through ContentManager.getNavigation rather than selecting `structure`
 * directly — that helper is the only path that handles the double-encoded-JSON
 * case and a missing `routes` array. Titles are stripped of badge markup
 * (a section may be titled `Payment & Billing <span class="premium-feature">Pro</span>`)
 * so they can be compared against what a writer actually types.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const sql = getDb();

  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (!(await checkProjectAccess(session.user.id, project.id, "viewer"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const navigation = await ContentManager.create().getNavigation(project.id);

    const sections = navigation.routes
      .map((route) => ({
        title: stripTitleHTML(route.title ?? "").trim(),
        path: route.path ?? null,
      }))
      .filter((section) => section.title.length > 0);

    return Response.json({ sections });
  } catch (error) {
    console.error("[GET /api/projects/:slug/sections] Error:", error);
    // Advisory data — an empty list simply means no category guidance.
    return Response.json({ sections: [] });
  }
}

/**
 * Add a new section to project navigation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { title, slug: rawSlug, createDescription } = await request.json();

  if (!title || !rawSlug) {
    return Response.json(
      { error: "Title and slug are required" },
      { status: 400 }
    );
  }

  const slug = rawSlug.replace(/^\/+|\/+$/g, "");

  const sql = getDb();

  // Get project
  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Check access
  const hasAccess = await checkProjectAccess(
    session.user.id,
    project.id,
    "editor"
  );
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get current navigation
  const [nav] = await sql`
    SELECT structure FROM navigation WHERE project_id = ${project.id}
  `;

  let structure = nav?.structure || {
    title: "Documentation",
    version: "1.0",
    routes: [],
  };

  const path = `/docs/${slug}`;

  // Reject duplicate slugs: a matching navigation route or an existing
  // document with this slug both point to the same URL and cause glitches.
  const pathTaken = (structure.routes ?? []).some(
    (route: { path?: string }) => route.path === path
  );
  const [existingDoc] = await sql`
    SELECT id FROM documents WHERE project_id = ${project.id} AND slug = ${slug}
  `;

  if (pathTaken || existingDoc) {
    return Response.json(
      { error: "A page with this URL slug already exists. Use a unique slug." },
      { status: 409 }
    );
  }

  // Add new section
  const newSection = {
    title,
    path,
    children: [],
  };

  structure.routes.push(newSection);

  // Update or create navigation
  if (nav) {
    await sql`
      UPDATE navigation
      SET structure = ${sql.json(structure)}
      WHERE project_id = ${project.id}
    `;
  } else {
    await sql`
      INSERT INTO navigation (project_id, structure)
      VALUES (${project.id}, ${sql.json(structure)})
    `;
  }

  // Optionally create a section description document
  if (createDescription) {
    const initialBlocks = [
      {
        id: "1",
        type: "heading",
        props: { level: 1 },
        content: [{ type: "text", text: title, styles: {} }],
        children: [],
      },
      {
        id: "2",
        type: "paragraph",
        props: {},
        content: [
          {
            type: "text",
            text: "Add an overview or introduction for this section...",
            styles: {},
          },
        ],
        children: [],
      },
    ];

    await sql`
      INSERT INTO documents (
        project_id, slug, title, blocks, published, created_by
      )
      VALUES (
        ${project.id},
        ${slug},
        ${title},
        ${sql.json(initialBlocks as any)},
        true,
        ${session.user.id}
      )
    `;
  }

  return Response.json({ success: true, section: newSection });
}
