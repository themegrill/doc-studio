import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { list } from "@vercel/blob";
import AdmZip from "adm-zip";

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

  if (blobs.length === 0) {
    return NextResponse.json({ error: "No UI flow images found" }, { status: 404 });
  }

  const zip = new AdmZip();

  await Promise.all(
    blobs.map(async (blob) => {
      try {
        const res = await fetch(blob.url);
        if (!res.ok) return;
        const buffer = Buffer.from(await res.arrayBuffer());
        const filename = blob.pathname.split("/").pop()!;
        zip.addFile(filename, buffer);
      } catch {
        // Skip blobs that can't be fetched
      }
    })
  );

  const zipBuffer = zip.toBuffer();

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${projectSlug}-ui-flow-images.zip"`,
      "Content-Length": String(zipBuffer.length),
    },
  });
}
