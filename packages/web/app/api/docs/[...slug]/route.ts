import { NextRequest, NextResponse } from "next/server";
import { ContentManager } from "@/lib/db/ContentManager";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  try {
    const resolvedParams = await params;
    const slug = resolvedParams.slug.join("/");

    console.log("[GET /api/docs] Fetching document:", { slug });

    // Find which project this document belongs to
    const sql = getDb();
    const [doc] = await sql`
      SELECT project_id FROM documents WHERE slug = ${slug} LIMIT 1
    `;

    if (!doc) {
      console.warn("[GET /api/docs] Document not found:", { slug });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const cm = ContentManager.create();
    const docContent = await cm.getDoc(doc.project_id, slug);

    if (!docContent) {
      console.warn("[GET /api/docs] Document content not found:", { slug });
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    console.log("[GET /api/docs] Document retrieved successfully:", { slug });
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

  console.log("[PUT /api/docs] Request received:", { slug });

  try {
    // Check authentication with NextAuth
    console.log("[PUT /api/docs] Verifying user authentication");
    const session = await auth();

    if (!session?.user) {
      console.error("[PUT /api/docs] Unauthorized request - no user found:", {
        slug,
      });
      return NextResponse.json(
        { error: "Unauthorized - no user" },
        { status: 401 },
      );
    }

    console.log("[PUT /api/docs] User authenticated:", {
      slug,
      email: session.user.email,
      userId: session.user.id,
    });

    // Parse request body
    console.log("[PUT /api/docs] Parsing request body");
    const body = await request.json();
    console.log("[PUT /api/docs] Request body parsed:", {
      slug,
      title: body.title,
      blocksCount: body.blocks?.length || 0,
    });

    // Save to database
    console.log("[PUT /api/docs] Saving document to database:", { slug });

    // Find which project this document belongs to
    const sql = getDb();
    const [doc] = await sql`
      SELECT project_id FROM documents WHERE slug = ${slug} LIMIT 1
    `;

    if (!doc) {
      console.error("[PUT /api/docs] Document not found:", { slug });
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    console.log("[PUT /api/docs] Found document in project:", {
      slug,
      projectId: doc.project_id
    });

    const cm = ContentManager.create();
    const success = await cm.saveDoc(doc.project_id, slug, body);

    if (!success) {
      console.error("[PUT /api/docs] Save operation failed:", {
        slug,
        reason: "ContentManager returned false",
      });
      return NextResponse.json(
        { error: "Save failed in ContentManager" },
        { status: 500 },
      );
    }

    console.log("[PUT /api/docs] Document saved successfully:", { slug });
    return NextResponse.json({ success: true, slug });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[PUT /api/docs] Unexpected error:", {
      slug,
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        message: err.message,
        stack: err.stack,
      },
      { status: 500 },
    );
  }
}
