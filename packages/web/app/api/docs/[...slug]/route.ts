import { NextRequest, NextResponse } from "next/server";
import { ContentManager } from "@/lib/db/ContentManager";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { getProjectFromRequest } from "@/lib/project-helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
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
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join("/");

  try {
    // Check authentication with NextAuth
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
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
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      );
    }

    const cm = ContentManager.create();
    const success = await cm.saveDoc(project.id, slug, body);

    if (!success) {
      return NextResponse.json(
        { error: "Save failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, slug });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[PUT /api/docs] Error:", err.message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const resolvedParams = await params;
  const slug = resolvedParams.slug.join("/");

  try {
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
