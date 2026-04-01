import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import {
  getOrCreateVercelClientProjectId,
  getWebAppUrl,
  isVercelConfigured,
  resolveGitSource,
  upsertVercelEnvVars,
  vercelHeaders,
} from "@/lib/vercel-client";
import { NextRequest } from "next/server";

const VERCEL_DEPLOY_BRANCH = process.env.VERCEL_DEPLOY_BRANCH ?? "main";

/**
 * POST /api/projects/[projectSlug]/domain/deploy
 * Triggers a production deployment of the client project on Vercel.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const sql = getDb();

  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;
  const isSuperAdmin =
    userData?.role === "super_admin" || userData?.role === "admin";
  if (!isSuperAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [project] = await sql`
    SELECT id, domain, settings FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (!project.domain) {
    return Response.json(
      { error: "No domain configured for this project" },
      { status: 400 }
    );
  }

  const domainStatus = project.settings?.deploy?.status;
  if (!domainStatus || domainStatus === "pending_dns") {
    return Response.json(
      { error: "Domain must be verified before deploying" },
      { status: 400 }
    );
  }

  if (!isVercelConfigured()) {
    return Response.json(
      { error: "Vercel integration is not configured on this server" },
      { status: 503 }
    );
  }

  let vercelProjectId: string;
  let gitSource: { type: string; org: string; repo: string };
  try {
    vercelProjectId = await getOrCreateVercelClientProjectId(projectSlug);
    gitSource = await resolveGitSource();
    await upsertVercelEnvVars(vercelProjectId, {
      PROJECT_SLUG: projectSlug,
      API_BASE_URL: getWebAppUrl(new URL(request.url).origin),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to resolve Vercel project" },
      { status: 502 }
    );
  }

  const teamQuery = process.env.VERCEL_TEAM_ID
    ? `?teamId=${process.env.VERCEL_TEAM_ID}`
    : "";

  const vercelRes = await fetch(
    `https://api.vercel.com/v13/deployments${teamQuery}`,
    {
      method: "POST",
      headers: vercelHeaders(),
      body: JSON.stringify({
        name: "doc-studio-client",
        project: vercelProjectId,
        target: "production",
        gitSource: {
          type: gitSource.type,
          org: gitSource.org,
          repo: gitSource.repo,
          ref: VERCEL_DEPLOY_BRANCH,
        },
      }),
    }
  );

  let vercelData: Record<string, any>;
  try {
    vercelData = await vercelRes.json();
  } catch {
    return Response.json(
      { error: "Unexpected response from Vercel API" },
      { status: 502 }
    );
  }

  if (!vercelRes.ok) {
    return Response.json(
      { error: vercelData?.error?.message ?? "Failed to trigger deployment" },
      { status: 502 }
    );
  }

  return Response.json({
    success: true,
    deployment: {
      id: vercelData.id,
      url: vercelData.url ? `https://${vercelData.url}` : null,
      state: vercelData.readyState ?? "QUEUED",
      createdAt: new Date().toISOString(),
    },
  });
}

/**
 * GET /api/projects/[projectSlug]/domain/deploy?id={deploymentId}
 * Returns the current state of a Vercel deployment.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const deploymentId = request.nextUrl.searchParams.get("id");

  if (!deploymentId) {
    return Response.json({ error: "Deployment ID is required" }, { status: 400 });
  }

  // Confirm project exists and user has access
  const sql = getDb();
  const [project] = await sql`SELECT id FROM projects WHERE slug = ${projectSlug}`;
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (!isVercelConfigured()) {
    return Response.json(
      { error: "Vercel integration is not configured" },
      { status: 503 }
    );
  }

  const teamQuery = process.env.VERCEL_TEAM_ID
    ? `?teamId=${process.env.VERCEL_TEAM_ID}`
    : "";

  const vercelRes = await fetch(
    `https://api.vercel.com/v13/deployments/${deploymentId}${teamQuery}`,
    { headers: vercelHeaders() }
  );

  let vercelData: Record<string, any>;
  try {
    vercelData = await vercelRes.json();
  } catch {
    return Response.json(
      { error: "Unexpected response from Vercel API" },
      { status: 502 }
    );
  }

  if (!vercelRes.ok) {
    return Response.json(
      { error: vercelData?.error?.message ?? "Failed to fetch deployment status" },
      { status: 502 }
    );
  }

  return Response.json({
    id: vercelData.id,
    url: vercelData.url ? `https://${vercelData.url}` : null,
    state: vercelData.readyState,
    createdAt: vercelData.createdAt,
  });
}