import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import {
  getOrCreateVercelClientProjectId,
  isVercelConfigured,
  vercelHeaders,
} from "@/lib/vercel-client";
import { NextRequest } from "next/server";

/**
 * POST /api/projects/[projectSlug]/domain/verify
 * Checks Vercel for the latest domain verification + SSL status,
 * updates the project settings accordingly.
 */
export async function POST(
  _request: NextRequest,
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

  if (!isVercelConfigured()) {
    return Response.json(
      { error: "Vercel integration is not configured on this server" },
      { status: 503 }
    );
  }

  let vercelProjectId: string;
  try {
    vercelProjectId = await getOrCreateVercelClientProjectId(projectSlug);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to resolve Vercel project" },
      { status: 502 }
    );
  }

  // Ask Vercel for the current domain status
  const vercelRes = await fetch(
    `https://api.vercel.com/v9/projects/${vercelProjectId}/domains/${project.domain}`,
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
      { error: vercelData?.error?.message ?? "Failed to check domain status" },
      { status: 502 }
    );
  }

  // verified: DNS is pointing correctly; sslCertificates ready = active
  const dnsVerified = vercelData.verified === true;
  const sslReady =
    Array.isArray(vercelData.sslCertificates) &&
    vercelData.sslCertificates.some(
      (c: { status: string }) => c.status === "issued"
    );

  const newStatus: "pending_dns" | "verified" | "active" = dnsVerified
    ? sslReady
      ? "active"
      : "verified"
    : "pending_dns";

  const currentDeploy = project.settings?.deploy ?? {};
  const updatedDeploy = {
    ...currentDeploy,
    status: newStatus,
    verification: vercelData.verification ?? [],
    verifiedAt:
      dnsVerified && !currentDeploy.verifiedAt
        ? new Date().toISOString()
        : (currentDeploy.verifiedAt ?? null),
  };

  const updatedSettings = {
    ...(project.settings ?? {}),
    deploy: updatedDeploy,
  };

  await sql`
    UPDATE projects
    SET settings = ${sql.json(updatedSettings)},
        updated_at = NOW()
    WHERE id = ${project.id}
  `;

  return Response.json({ success: true, status: newStatus, deploy: updatedDeploy });
}