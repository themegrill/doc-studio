import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;

  const body = await request.json();
  const { websiteUrl } = body;

  if (!websiteUrl) {
    return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
  }

  const kbDir = path.join(process.cwd(), "knowledge-base", projectSlug);
  const outputPath = path.join(kbDir, "website-knowledge-base.json");
  const progressPath = path.join(kbDir, "crawl-progress.json");
  const pidPath = path.join(kbDir, "crawl-pid.txt");

  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "utils",
    "crawl-website-as-knowledgebase.ts"
  );

  // Write initial progress so polling works immediately
  if (!fs.existsSync(kbDir)) fs.mkdirSync(kbDir, { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify({
    status: "crawling",
    visitedPages: 0,
    maxPages: 200,
    currentBatch: 0,
    totalBatches: 0,
    progress: 0,
    message: "Starting crawl...",
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  }, null, 2), "utf-8");

  const logPath = path.join(kbDir, "crawl-log.txt");
  const logFd = fs.openSync(logPath, "w");

  // Use tsx binary directly — shell: true is required on Windows to execute .CMD files
  const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const child = spawn(tsxBin, [scriptPath, websiteUrl, outputPath], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    shell: true,
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    cwd: process.cwd(),
  });

  fs.closeSync(logFd);

  if (child.pid) {
    fs.writeFileSync(pidPath, String(child.pid), "utf-8");
  }

  child.unref();

  return NextResponse.json({ message: "Knowledge base fetch started" }, { status: 200 });
}
