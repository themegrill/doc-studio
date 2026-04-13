import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { DocumentationKnowledgeBase } from "@/types/knowledge-base";
import { invalidateKbCache } from "@/lib/kb-cache";

const GITHUB_API_BASE = "https://api.github.com";

type JSONPrimitive = string | number | boolean | null;
type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };

/**
 * POST /api/projects/[projectSlug]/knowledge-base/fetch-codebase
 *
 * Reads GitHub credentials (repo, token, branch) from global_settings,
 * then fetches a knowledge base JSON file at the given filePath and saves
 * it into project_knowledge_bases with type='codebase'.
 *
 * Body: {
 *   filePath?: string  // path inside the repo; falls back to auto-detect
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = getDb();

  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;
  const isSuperAdmin =
    userData?.role === "super_admin" || userData?.role === "admin";
  if (!isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { projectSlug } = await params;

  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Load GitHub credentials from global settings
  const [githubSettingsRow] = await sql`
    SELECT value FROM global_settings WHERE key = 'github.config'
  `;
  const githubConfig = githubSettingsRow?.value || {};
  const repo = ((githubConfig.repo as string) || "").trim();
  const token = ((githubConfig.token as string) || "").trim();
  const branch = ((githubConfig.branch as string) || "main").trim() || "main";

  if (!repo || !repo.includes("/")) {
    return NextResponse.json(
      {
        error:
          "GitHub integration is not configured. Please set the repository in Settings → GitHub Integration.",
      },
      { status: 400 }
    );
  }

  let body: { filePath?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  const { filePath } = body;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  // File paths to try in order
  const filePaths = filePath?.trim()
    ? [filePath.trim()]
    : [
        `plugins/${projectSlug}/knowledge_base.json`,
        `plugins/${projectSlug}/documentation.json`,
        `plugins/${projectSlug}/knowledgebase.json`,
        "documentation.json",
        "knowledgebase.json",
        "knowledge-base.json",
      ];

  let knowledgeBase: DocumentationKnowledgeBase | null = null;
  let resolvedFilePath: string | null = null;

  for (const fp of filePaths) {
    const apiUrl = `${GITHUB_API_BASE}/repos/${repo}/contents/${fp}?ref=${branch}`;

    try {
      const res = await fetch(apiUrl, { headers });
      if (!res.ok) continue;

      const data = await res.json();

      if (data.content && data.encoding === "base64") {
        const decoded = Buffer.from(data.content, "base64").toString("utf-8");
        knowledgeBase = JSON.parse(decoded) as DocumentationKnowledgeBase;
        resolvedFilePath = fp;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!knowledgeBase) {
    return NextResponse.json(
      {
        error:
          `Could not find a knowledge base file in '${repo}' (branch: ${branch}). ` +
          `Tried: ${filePaths.join(", ")}`,
      },
      { status: 404 }
    );
  }

  const kbMetadata = {
    githubRepo: repo,
    branch,
    filePath: resolvedFilePath,
  };

  await sql`
	INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
	VALUES (
		${project.id},
		'codebase',
		${sql.json(toJSONValue(knowledgeBase))},
		${sql.json(toJSONValue(kbMetadata))}
	)
	ON CONFLICT (project_id, type)
	DO UPDATE SET
		content    = EXCLUDED.content,
		metadata   = EXCLUDED.metadata,
		updated_at = NOW()
	`;

  // Invalidate the server-side KB prompt cache so the next chat request
  // fetches the updated knowledge base from the database.
  invalidateKbCache(projectSlug);

  return NextResponse.json({
    success: true,
    repo,
    branch,
    filePath: resolvedFilePath,
  });
}

function toJSONValue(value: unknown): JSONValue {
  return JSON.parse(JSON.stringify(value)) as JSONValue;
}
