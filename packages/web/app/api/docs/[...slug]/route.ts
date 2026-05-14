import { NextRequest, NextResponse } from "next/server";
import { ContentManager } from "@/lib/db/ContentManager";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { getProjectFromRequest } from "@/lib/project-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams.slug.join("/");

    // Find which project this document belongs to
    const sql = getDb();
    const [doc] = await sql`
      SELECT project_id FROM documents WHERE slug = ${slug} LIMIT 1
    `;

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const cm = ContentManager.create();
    const docContent = await cm.getDoc(doc.project_id, slug);

    if (!docContent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(docContent);
  } catch (error: unknown) {
    const err = error as Error;
    const resolvedParams = await params;
    console.error("[GET /api/docs] Error retrieving document:", {
      slug: resolvedParams.slug.join("/"),
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams.slug.join("/");
    // Check authentication with NextAuth
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();

    // Get project from request context (hostname/path)
    const hostname = request.headers.get("host") || "localhost";

    // Try to get the actual page path from Referer header
    const referer = request.headers.get("referer") || "";
    let pathname = `/docs/${slug}`;

    if (referer) {
      try {
        const refererUrl = new URL(referer);
        pathname = refererUrl.pathname;
      } catch (e) {
        // Fallback to default pathname
      }
    }

    const project = await getProjectFromRequest(hostname, pathname);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const cm = ContentManager.create();
    const docContent = {
      ...body,
      published:
        typeof body.published === "boolean" ? body.published : undefined,
    };
    const success = await cm.saveDoc(project.id, slug, docContent);

    if (!success) {
      return NextResponse.json({ error: "Save failed" }, { status: 500 });
    }

    // Handle slug rename if requested
    const newSlug = typeof body.newSlug === "string" ? body.newSlug.trim() : null;
    if (newSlug && newSlug !== slug) {
      const sql = getDb();

      // Check the doc exists in this project
      const [existing] = await sql`
        SELECT id FROM documents WHERE project_id = ${project.id} AND slug = ${slug}
      `;
      if (!existing) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      // Check new slug is not already taken
      const [conflict] = await sql`
        SELECT id FROM documents WHERE project_id = ${project.id} AND slug = ${newSlug}
      `;
      if (conflict) {
        return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
      }

      // Update the slug in the documents table
      await sql`
        UPDATE documents SET slug = ${newSlug} WHERE project_id = ${project.id} AND slug = ${slug}
      `;

      // Update the slug in the navigation structure
      const [nav] = await sql`
        SELECT id, structure FROM navigation WHERE project_id = ${project.id} ORDER BY updated_at DESC LIMIT 1
      `;
      if (nav?.structure) {
        const structure = nav.structure as any;
        const oldPath = `/docs/${slug}`;
        const newPath = `/docs/${newSlug}`;
        const docId = existing.id;

        const updateEntry = (child: any) => {
          if (
            child.id === docId ||
            child.path === oldPath ||
            child.slug === slug
          ) {
            return { ...child, path: newPath, slug: newSlug };
          }
          return child;
        };

        let updated = false;
        if (structure.routes) {
          structure.routes = structure.routes.map((route: any) => {
            if (route.children?.length) {
              const next = route.children.map(updateEntry);
              if (JSON.stringify(next) !== JSON.stringify(route.children)) updated = true;
              return { ...route, children: next };
            }
            return route;
          });
        }

        if (updated) {
          await sql`
            UPDATE navigation SET structure = ${sql.json(structure)}, updated_at = NOW()
            WHERE id = ${nav.id}
          `;
        }
      }

      return NextResponse.json({ success: true, slug: newSlug });
    }

    return NextResponse.json({ success: true, slug });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[PUT /api/docs] Error:", err.message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams.slug.join("/");
    // Check authentication
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Find which project this document belongs to
    const sql = getDb();
    const [doc] = await sql`
      SELECT project_id FROM documents WHERE slug = ${slug} LIMIT 1
    `;

    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Delete the document
    const cm = ContentManager.create();
    await cm.deleteDoc(doc.project_id, slug);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[DELETE /api/docs] Error:", err.message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
