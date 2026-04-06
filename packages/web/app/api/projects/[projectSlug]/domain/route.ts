import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import {
  getOrCreateVercelClientProjectId,
  getWebAppUrl,
  isVercelConfigured,
  upsertVercelEnvVars,
  vercelHeaders,
} from "@/lib/vercel-client";
import { NextRequest } from "next/server";

/**
 * GET /api/projects/[projectSlug]/domain
 * Returns the current domain config for the project.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const sql = getDb();

  const [project] = await sql`
    SELECT id, domain, settings FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({
    domain: project.domain ?? null,
    deploy: project.settings?.deploy ?? null,
  });
}

/**
 * POST /api/projects/[projectSlug]/domain
 * Body: { domain: "help.client.com" }
 * Creates the Vercel client project if needed, adds the domain, saves state to DB.
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
    SELECT id, settings FROM projects WHERE slug = ${projectSlug}
  `;
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await request.json();
  const domain: string = (body.domain ?? "").trim().toLowerCase();

  if (!domain) {
    return Response.json({ error: "Domain is required" }, { status: 400 });
  }

  const domainRegex =
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return Response.json({ error: "Invalid domain format" }, { status: 400 });
  }

  if (!isVercelConfigured()) {
    return Response.json(
      { error: "Vercel integration is not configured on this server" },
      { status: 503 }
    );
  }

  // Resolve (or auto-create) the Vercel client project
  let vercelProjectId: string;
  try {
    vercelProjectId = await getOrCreateVercelClientProjectId(projectSlug);
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

  // Add domain to the Vercel project
  const vercelRes = await fetch(
    `https://api.vercel.com/v10/projects/${vercelProjectId}/domains`,
    {
      method: "POST",
      headers: vercelHeaders(),
      body: JSON.stringify({ name: domain }),
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
      { error: vercelData?.error?.message ?? "Failed to add domain to Vercel" },
      { status: 502 }
    );
  }

  // Fetch DNS configuration so we can show the user what records to set
  const configRes = await fetch(
    `https://api.vercel.com/v6/domains/${domain}/config`,
    { headers: vercelHeaders() }
  );
  const configData = configRes.ok ? await configRes.json() : null;

  const dnsRecords = buildDnsRecords(domain, configData, vercelData);

  const deploySettings = {
    domain,
    status: vercelData.verified ? "verified" : "pending_dns",
    vercelProjectId,
    vercelDomainAdded: true,
    dnsRecords,
    verification: vercelData.verification ?? [],
    addedAt: new Date().toISOString(),
    verifiedAt: vercelData.verified ? new Date().toISOString() : null,
  };

  const existingSettings = safeSettingsObject(project.settings);
  const updatedSettings = {
    ...existingSettings,
    deploy: deploySettings,
  };

  await sql`
    UPDATE projects
    SET domain = ${domain},
        settings = ${sql.json(updatedSettings)},
        updated_at = NOW()
    WHERE id = ${project.id}
  `;

  return Response.json({ success: true, deploy: deploySettings });
}

/**
 * DELETE /api/projects/[projectSlug]/domain
 * Removes the domain from Vercel and clears it from the DB.
 */
export async function DELETE(
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
    return Response.json({ error: "No domain is configured" }, { status: 400 });
  }

  if (isVercelConfigured()) {
    try {
      const vercelProjectId = await getOrCreateVercelClientProjectId(projectSlug);
      await fetch(
        `https://api.vercel.com/v9/projects/${vercelProjectId}/domains/${project.domain}`,
        { method: "DELETE", headers: vercelHeaders() }
      );
    } catch {
      // Non-fatal — proceed with DB cleanup even if Vercel removal fails
    }
  }

  const updatedSettings = { ...safeSettingsObject(project.settings) };
  delete updatedSettings.deploy;

  await sql`
    UPDATE projects
    SET domain = NULL,
        settings = ${sql.json(updatedSettings)},
        updated_at = NOW()
    WHERE id = ${project.id}
  `;

  return Response.json({ success: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely convert a project.settings value to a plain object.
 * Guards against corrupted settings (e.g. a string that was spread
 * character-by-character into an object with numeric keys).
 */
function safeSettingsObject(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  // Corrupted: all keys are numeric strings (character spread artifact)
  const keys = Object.keys(obj);
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    try {
      const recovered = JSON.parse(
        keys.sort((a, b) => Number(a) - Number(b)).map((k) => obj[k]).join("")
      );
      if (recovered && typeof recovered === "object" && !Array.isArray(recovered)) {
        return recovered as Record<string, unknown>;
      }
    } catch { /* fall through */ }
    return {};
  }
  return obj;
}

function buildDnsRecords(
  domain: string,
  configData: Record<string, any> | null,
  vercelData: Record<string, any>
): Array<{ type: string; name: string; value: string; purpose: string }> {
  const records: Array<{
    type: string;
    name: string;
    value: string;
    purpose: string;
  }> = [];

  const parts = domain.split(".");
  const recordName = parts.length > 2 ? parts.slice(0, -2).join(".") : "@";

  if (configData?.cnames?.length) {
    records.push({
      type: "CNAME",
      name: recordName === "@" ? domain : recordName,
      value: configData.cnames[0],
      purpose: "Points your domain to Vercel",
    });
  } else if (configData?.aValues?.length) {
    records.push({
      type: "A",
      name: recordName,
      value: configData.aValues[0],
      purpose: "Points your domain to Vercel",
    });
  } else {
    // Fallback defaults
    if (parts.length > 2) {
      records.push({
        type: "CNAME",
        name: recordName,
        value: "cname.vercel-dns.com",
        purpose: "Points your domain to Vercel",
      });
    } else {
      records.push({
        type: "A",
        name: "@",
        value: "76.76.21.21",
        purpose: "Points your domain to Vercel",
      });
    }
  }

  // TXT ownership verification records (if Vercel requires them)
  if (vercelData.verification?.length) {
    for (const v of vercelData.verification) {
      records.push({
        type: v.type,
        name: v.domain,
        value: v.value,
        purpose: "Domain ownership verification",
      });
    }
  }

  return records;
}