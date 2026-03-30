import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;

  const kbDir = path.join(process.cwd(), "knowledge-base", projectSlug);
  const progressPath = path.join(kbDir, "crawl-progress.json");
  const pidPath = path.join(kbDir, "crawl-pid.txt");

  if (!fs.existsSync(pidPath)) {
    return NextResponse.json({ error: "No running crawl found" }, { status: 404 });
  }

  const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);

  if (isNaN(pid)) {
    return NextResponse.json({ error: "Invalid PID" }, { status: 400 });
  }

  try {
    if (process.platform === "win32") {
      // Kill entire process tree on Windows
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    // Process may have already exited — that's fine
  }

  // Mark progress as cancelled before deleting files
  if (fs.existsSync(progressPath)) {
    try {
      const current = JSON.parse(fs.readFileSync(progressPath, "utf-8"));
      fs.writeFileSync(progressPath, JSON.stringify({
        ...current,
        status: "error",
        message: "Crawl cancelled by user.",
        error: "Cancelled",
        completedAt: new Date().toISOString(),
      }, null, 2), "utf-8");
    } catch { /* ignore */ }
  }

  // Clean up temp files
  const logPath = path.join(kbDir, "crawl-log.txt");
  for (const f of [pidPath, logPath]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  }

  return NextResponse.json({ message: "Crawl cancelled" });
}
