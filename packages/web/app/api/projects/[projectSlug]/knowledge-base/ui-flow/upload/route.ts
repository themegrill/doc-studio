import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { put } from "@vercel/blob";

const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);
const SUPPORTED_EXTS = new Set([".png", ".jpg", ".jpeg"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_");
}

export async function POST(
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const files = formData.getAll("images") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No images provided" }, { status: 400 });
  }

  const saved: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_TYPES.has(file.type) && !SUPPORTED_EXTS.has(ext)) {
      errors.push(`${file.name}: unsupported file type`);
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: file exceeds 10 MB limit`);
      continue;
    }

    const safeFilename = sanitizeFilename(file.name);

    try {
      await put(`ui-flow-images/${projectSlug}/${safeFilename}`, file, {
        access: "public",
        contentType: file.type || "image/png",
        addRandomSuffix: false,
      });
      saved.push(safeFilename);
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
    }
  }

  return NextResponse.json({ saved, errors });
}
