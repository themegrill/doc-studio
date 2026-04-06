import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { list, del } from "@vercel/blob";

/**
 * GET /api/projects/[projectSlug]/knowledge-base/ui-flow/images
 * Lists UI flow images stored in Vercel Blob for this project.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { blobs } = await list({ prefix: `ui-flow-images/${projectSlug}/` });

  const images = blobs.map((blob) => ({
    name: blob.pathname.split("/").pop()!,
    size: blob.size,
    url: blob.url,
  }));

  return NextResponse.json({ images });
}

/**
 * DELETE /api/projects/[projectSlug]/knowledge-base/ui-flow/images
 * Body: { filename: string } — deletes a single image.
 * Body: { all: true } — deletes all images for the project.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();
  const [userData] = await sql`SELECT role FROM users WHERE id = ${session.user.id}`;
  if (!userData || !["admin", "super_admin"].includes(userData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectSlug } = await params;
  const body = await request.json().catch(() => ({})) as { filename?: string; all?: boolean };

  if (body.all) {
    const { blobs } = await list({ prefix: `ui-flow-images/${projectSlug}/` });
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url));
    }
    return NextResponse.json({ success: true });
  }

  if (!body.filename) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  const { blobs } = await list({ prefix: `ui-flow-images/${projectSlug}/${body.filename}` });
  if (blobs.length === 0) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await del(blobs[0].url);
  return NextResponse.json({ success: true });
}
