import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { checkImage } from "@/lib/editorial/image-check";
import { readImageInfo } from "@/lib/editorial/image-dimensions";
import { getGuidelines } from "@/lib/editorial/config";

export async function POST(request: NextRequest) {
  console.log("[POST /api/upload] File upload request received");

  try {
    const session = await auth();

    if (!session?.user) {
      console.error("[POST /api/upload] Unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const username =
      session.user.email?.split("@")[0] || session.user.id.substring(0, 8);

    console.log("[POST /api/upload] User authenticated:", {
      email: session.user.email,
      userId: session.user.id,
      username: username,
    });

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

    const validImageTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];
    const validVideoTypes = [
      "video/mp4",
      "video/webm",
      "video/ogg",
      "video/quicktime",
      "video/x-msvideo",
    ];
    // Browsers frequently hand over a dragged file with an empty or generic
    // `type` (e.g. "" or application/octet-stream), which used to fail the MIME
    // allowlist and produce a confusing rejection for a perfectly good PNG. Sniff
    // the real format from the header bytes and let that override the MIME.
    const headerBytes = new Uint8Array(
      await file.slice(0, 64 * 1024).arrayBuffer(),
    );
    const sniffed = readImageInfo(headerBytes);

    const isImage =
      validImageTypes.includes(file.type) || sniffed.format !== "unknown";
    const isVideo = !isImage && validVideoTypes.includes(file.type);

    if (!isImage && !isVideo) {
      console.error("[POST /api/upload] Invalid file type:", {
        type: file.type || "(none)",
        sniffed: sniffed.format,
      });
      return NextResponse.json(
        {
          error: `Unsupported file type${file.type ? ` "${file.type}"` : ""}. Only images and videos are allowed.`,
        },
        { status: 400 },
      );
    }

    const maxSize = isVideo ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      console.error("[POST /api/upload] File too large:", { size: file.size, maxSize });
      return NextResponse.json(
        { error: `File too large. Maximum size is ${isVideo ? "100MB" : "5MB"}.` },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Screenshot compliance (DOCSTUDIO-45 §3). The editor runs the identical
    // check before uploading so the writer gets instant feedback; this is the
    // rule of record, since the endpoint is reachable directly. We reject rather
    // than auto-convert — see lib/editorial/image-check.ts for why.
    if (isImage) {
      const guidelines = await getGuidelines(
        formData.get("projectSlug")?.toString() || null,
      );
      const check = checkImage(new Uint8Array(buffer), file.size, guidelines);

      if (!check.ok) {
        console.error("[POST /api/upload] Image failed editorial guidelines:", {
          name: file.name,
          failures: check.failures,
        });
        return NextResponse.json(
          {
            error: check.failures.join(" "),
            failures: check.failures,
            guideline: "images",
          },
          { status: 400 },
        );
      }

      if (check.notes.length) {
        console.log("[POST /api/upload] Image accepted with notes:", check.notes);
      }
    }

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const ext = file.name.split(".").pop();
    const filename = `${timestamp}-${randomStr}.${ext}`;

    // Use Vercel Blob in production, local filesystem in development
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const pathname = `uploads/${username}/${filename}`;
      console.log("[POST /api/upload] Uploading to Vercel Blob:", { pathname });

      const blob = await put(pathname, buffer, {
        access: "public",
        contentType: file.type,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      console.log("[POST /api/upload] File uploaded to blob:", blob.url);

      return NextResponse.json({
        success: true,
        url: blob.url,
        filename: file.name,
      });
    }

    // Local filesystem fallback
    const uploadsDir = path.join(process.cwd(), "public", "uploads", username);
    await mkdir(uploadsDir, { recursive: true });

    const filepath = path.join(uploadsDir, filename);

    console.log("[POST /api/upload] Saving file to:", { filepath });
    await writeFile(filepath, buffer);

    const publicUrl = `/uploads/${username}/${filename}`;
    console.log("[POST /api/upload] File uploaded successfully:", { filepath, publicUrl });

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename: file.name,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("[POST /api/upload] Unexpected error:", {
      error: err.message,
      name: err.name,
      stack: err.stack,
    });
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
