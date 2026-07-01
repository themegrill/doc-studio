import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextRequest } from "next/server";

/** Public GET — returns integration config (no auth). Used by client app. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const sql = getDb();

  const [project] = await sql`
    SELECT settings FROM projects WHERE slug = ${projectSlug} LIMIT 1
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const integrations = project.settings?.integrations ?? {};
  return Response.json({ integrations });
}

/** Authenticated PUT — saves integrations block into settings JSONB. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectSlug } = await params;
  const { integrations } = await request.json();

  if (!integrations || typeof integrations !== "object") {
    return Response.json({ error: "integrations must be an object" }, { status: 400 });
  }

  const sql = getDb();

  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;
  const isSuperAdmin = userData?.role === "super_admin" || userData?.role === "admin";

  const [project] = await sql`
    SELECT id FROM projects WHERE slug = ${projectSlug} LIMIT 1
  `;
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (!isSuperAdmin) {
    const [membership] = await sql`
      SELECT role FROM project_members
      WHERE project_id = ${project.id} AND user_id = ${session.user.id}
    `;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Validate Crisp Website ID format — must be a standard UUID if provided
  const crispId = integrations.crispWebsiteId?.trim();
  if (crispId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(crispId)) {
      return Response.json(
        { error: "Invalid Crisp Website ID — must be a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)." },
        { status: 422 }
      );
    }
  }

  // Validate GA4 Measurement ID — format G-XXXXXXXXXX if provided
  const ga4Id = integrations.ga4MeasurementId?.trim();
  if (ga4Id && !/^G-[A-Z0-9]+$/i.test(ga4Id)) {
    return Response.json(
      { error: "Invalid GA4 Measurement ID — must look like G-XXXXXXXXXX." },
      { status: 422 }
    );
  }

  // Validate Microsoft Clarity project ID — alphanumeric if provided
  const clarityId = integrations.microsoftClarityId?.trim();
  if (clarityId && !/^[a-z0-9]+$/i.test(clarityId)) {
    return Response.json(
      { error: "Invalid Microsoft Clarity project ID — must be alphanumeric." },
      { status: 422 }
    );
  }

  // Guard custom code size — trusted admin input, but cap to avoid runaway payloads (~20 KB each).
  const MAX_CODE_LENGTH = 20_000;
  for (const [field, label] of [
    ["customHeadCode", "Header code"],
    ["customBodyCode", "Footer code"],
  ] as const) {
    const value = integrations[field];
    if (typeof value === "string" && value.length > MAX_CODE_LENGTH) {
      return Response.json(
        { error: `${label} is too large — keep it under ${MAX_CODE_LENGTH / 1000} KB.` },
        { status: 422 }
      );
    }
  }

  // Normalize Google Search Console verification — accept a bare token or a full
  // <meta name="google-site-verification" content="…"> paste (extract the content value).
  let gscToken = integrations.googleSiteVerification?.trim();
  if (gscToken) {
    const metaMatch = gscToken.match(/content=["']([^"']+)["']/i);
    if (metaMatch) gscToken = metaMatch[1];
    integrations.googleSiteVerification = gscToken;
  }

  // Merge integrations into existing settings to avoid clobbering deploy config etc.
  await sql`
    UPDATE projects
    SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('integrations', ${sql.json(integrations)}::jsonb),
        updated_at = NOW()
    WHERE id = ${project.id}
  `;

  return Response.json({ success: true });
}
