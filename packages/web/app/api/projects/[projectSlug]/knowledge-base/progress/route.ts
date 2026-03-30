import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;

  const kbDir = path.join(process.cwd(), "knowledge-base", projectSlug);
  const progressPath = path.join(kbDir, "crawl-progress.json");

  if (!fs.existsSync(progressPath)) {
    return NextResponse.json({ status: "idle", progress: 0, message: "Not started" });
  }

  try {
    const data = JSON.parse(fs.readFileSync(progressPath, "utf-8"));

    const logPath = path.join(kbDir, "crawl-log.txt");
    const log = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf-8").slice(-3000)
      : null;

    return NextResponse.json({ ...data, log });
  } catch {
    return NextResponse.json({ status: "error", progress: 0, message: "Failed to read progress" }, { status: 500 });
  }
}
