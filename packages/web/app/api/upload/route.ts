import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  console.log("[POST /api/upload] File upload request received");

  try {
    // Check authentication with NextAuth
    const session = await auth();

    if (!session?.user) {
      console.error("[POST /api/upload] Unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get username from email or id
    const username =
      session.user.email?.split("@")[0] || session.user.id.substring(0, 8);

    console.log("[POST /api/upload] User authenticated:", {
      email: session.user.email,
      userId: session.user.id,
      username: username,
    });

    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.error("[POST /api/upload] No file provided in request");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log("[POST /api/upload] File received:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Validate file type
    const validImageTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];
    if (!validImageTypes.includes(file.type)) {
      console.error("[POST /api/upload] Invalid file type:", {
        type: file.type,
      });
      return NextResponse.json(
        { error: "Invalid file type. Only images are allowed." },
        { status: 400 },
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      console.error("[POST /api/upload] File too large:", {
        size: file.size,
        maxSize,
      });
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 },
      );
    }

    // Generate unique filename with username
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const ext = file.name.split(".").pop();
    const filename = `${timestamp}-${randomStr}.${ext}`;

    // Create user directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "public", "uploads", username);
    await mkdir(uploadsDir, { recursive: true });

    // Save file to local filesystem
    const filepath = path.join(uploadsDir, filename);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("[POST /api/upload] Saving file to:", { filepath });

    await writeFile(filepath, buffer);

    // Generate public URL
    const publicUrl = `/uploads/${username}/${filename}`;

    console.log("[POST /api/upload] File uploaded successfully:", {
      filepath,
      publicUrl,
    });

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename: file.name,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[POST /api/upload] Unexpected error:", {
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
