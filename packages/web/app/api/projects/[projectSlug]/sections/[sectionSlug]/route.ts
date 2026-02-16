import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { checkProjectAccess } from "@/lib/project-helpers";
import { NextRequest } from "next/server";

/**
 * Update a section in project navigation
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string; sectionSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug, sectionSlug } = await params;
  const { title } = await request.json();

  if (!title) {
    return Response.json(
      { error: "Title is required" },
      { status: 400 }
    );
  }

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

  if (!nav) {
    return Response.json({ error: "Navigation not found" }, { status: 404 });
  }

  let structure = nav.structure;

  // Find and update the section
  // Handle both sections with path (old format) and category sections (new format)
  const sectionPath = `/docs/${sectionSlug}`;
  const sectionIndex = structure.routes.findIndex((route: any) => {
    // Check direct path match (old format)
    if (route.path === sectionPath) {
      return true;
    }
    // Check if this is a category section by checking children (new format)
    if (route.children && route.children.length > 0) {
      // Check if any child's path matches this section slug
      return route.children.some((child: any) => {
        const childSlug = child.slug || child.path?.replace('/docs/', '');
        return childSlug === sectionSlug || childSlug?.startsWith(sectionSlug + '/');
      });
    }
    return false;
  });

  if (sectionIndex === -1) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  // Update the section title
  structure.routes[sectionIndex].title = title;

  // Update navigation in database
  await sql`
    UPDATE navigation
    SET structure = ${sql.json(structure)}
    WHERE project_id = ${project.id}
  `;

  // Also update the section overview document title if it exists
  await sql`
    UPDATE documents
    SET title = ${title}
    WHERE project_id = ${project.id}
      AND slug = ${sectionSlug}
  `;

  return Response.json({ success: true, section: structure.routes[sectionIndex] });
}

/**
 * Delete a section from project navigation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string; sectionSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug, sectionSlug } = await params;
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

  if (!nav) {
    return Response.json({ error: "Navigation not found" }, { status: 404 });
  }

  let structure = nav.structure;

  // Find the section
  // Handle both sections with path (old format) and category sections (new format)
  const sectionPath = `/docs/${sectionSlug}`;
  const sectionIndex = structure.routes.findIndex((route: any) => {
    // Check direct path match (old format)
    if (route.path === sectionPath) {
      return true;
    }
    // Check if this is a category section by checking children (new format)
    if (route.children && route.children.length > 0) {
      // Check if any child's path matches this section slug
      return route.children.some((child: any) => {
        const childSlug = child.slug || child.path?.replace('/docs/', '');
        return childSlug === sectionSlug || childSlug?.startsWith(sectionSlug + '/');
      });
    }
    return false;
  });

  if (sectionIndex === -1) {
    return Response.json({ error: "Section not found" }, { status: 404 });
  }

  // Remove the section from navigation
  structure.routes.splice(sectionIndex, 1);

  // Update navigation in database
  await sql`
    UPDATE navigation
    SET structure = ${sql.json(structure)}
    WHERE project_id = ${project.id}
  `;

  // Delete all documents in this section
  await sql`
    DELETE FROM documents
    WHERE project_id = ${project.id}
      AND (slug = ${sectionSlug} OR slug LIKE ${sectionSlug + '/%'})
  `;

  return Response.json({ success: true });
}
