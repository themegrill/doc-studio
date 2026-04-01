import { getDb } from "@/lib/db/postgres";

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_GITHUB_REPO = process.env.VERCEL_GITHUB_REPO; // optional override e.g. "owner/doc-studio"
const VERCEL_ADMIN_PROJECT_ID =
  process.env.VERCEL_ADMIN_PROJECT_ID ?? "prj_BdMKSESJdRvZNV508vHwiuCiiLCA";
const VERCEL_TEAM_ID =
  process.env.VERCEL_TEAM_ID ?? "team_MudjARP3AD3hyR0PoMUCcRLD";

export function vercelHeaders() {
  return {
    Authorization: `Bearer ${VERCEL_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

export function isVercelConfigured() {
  return Boolean(VERCEL_API_TOKEN);
}

/**
 * Returns the Vercel project ID for a given doc-studio project slug.
 * Each project gets its own Vercel project named "doc-{projectSlug}".
 * Resolution order:
 *   1. global_settings DB (previously stored for this slug)
 *   2. Vercel API — find existing project by name
 *   3. Create a new Vercel project, store it, return it
 */
export async function getOrCreateVercelClientProjectId(
  projectSlug: string
): Promise<string> {
  const sql = getDb();
  const settingsKey = `vercel.project.${projectSlug}`;
  const vercelProjectName = `doc-${projectSlug}`;

  // 1. Check DB cache
  const [row] = await sql`
    SELECT value FROM global_settings WHERE key = ${settingsKey}
  `;
  if (row?.value?.projectId) {
    // Verify the project still exists on Vercel before returning the cached ID
    const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : "";
    const check = await fetch(
      `https://api.vercel.com/v9/projects/${row.value.projectId}${teamQuery}`,
      { headers: vercelHeaders() }
    );
    if (check.ok) return row.value.projectId as string;

    // Stale — fall through to re-create
  }

  // 2. Try to find by name on Vercel (handles the case where it was created
  //    manually or the DB entry was lost)
  const projectId =
    (await findExistingVercelProject(vercelProjectName).catch(() => null)) ??
    (await createVercelClientProject(vercelProjectName));

  await sql`
    INSERT INTO global_settings (key, value, category, description, created_at, updated_at)
    VALUES (
      ${settingsKey},
      ${sql.json({ projectId })},
      'vercel',
      ${"Auto-created Vercel project for doc-studio project: " + projectSlug},
      NOW(), NOW()
    )
    ON CONFLICT (key) DO UPDATE
      SET value = ${sql.json({ projectId })}, updated_at = NOW()
  `;

  return projectId;
}

/**
 * Resolves the git source { type, org, repo } needed to trigger a Vercel deployment.
 * Resolution order:
 *   1. VERCEL_GITHUB_REPO env var  ("owner/repo")
 *   2. githubOrg + githubRepo from the admin project's deployment metadata
 *      (no extra env vars or external API calls required)
 */
export async function resolveGitSource(): Promise<{
  type: string;
  org: string;
  repo: string;
}> {
  // 1. Explicit env var
  if (VERCEL_GITHUB_REPO) {
    const [org, repo] = VERCEL_GITHUB_REPO.split("/");
    if (org && repo) return { type: "github", org, repo };
  }

  // 2. Read from the admin project's deployment metadata
  const teamQuery = VERCEL_TEAM_ID ? `&teamId=${VERCEL_TEAM_ID}` : "";
  const res = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${VERCEL_ADMIN_PROJECT_ID}&limit=3${teamQuery}`,
    { headers: vercelHeaders() }
  );

  if (res.ok) {
    const data = await res.json();
    for (const dep of data.deployments ?? []) {
      const org = dep.meta?.githubOrg ?? dep.meta?.githubCommitOrg;
      const repo = dep.meta?.githubRepo ?? dep.meta?.githubCommitRepo;
      if (org && repo) return { type: "github", org, repo };
    }
  }

  throw new Error(
    "Could not determine GitHub repository. " +
      "Please set VERCEL_GITHUB_REPO=owner/repo-name in your environment."
  );
}

/**
 * Fetches the Vercel project details including the linked git repo info.
 */
export async function getVercelProjectDetails(projectId: string): Promise<{
  id: string;
  repoId: number | null;
  repoName: string | null;
  repoType: string | null;
}> {
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : "";
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}${teamQuery}`,
    { headers: vercelHeaders() }
  );

  if (!res.ok) throw new Error("Failed to fetch Vercel project details");

  const data = await res.json();
  return {
    id: data.id,
    repoId: data.link?.repoId ?? null,
    repoName: data.link?.repo ?? null,
    repoType: data.link?.type ?? null,
  };
}

async function createVercelClientProject(name: string): Promise<string> {
  if (!VERCEL_API_TOKEN) {
    throw new Error("VERCEL_API_TOKEN is not configured");
  }

  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : "";

  const body: Record<string, unknown> = {
    name,
    framework: "nextjs",
    rootDirectory: "packages/client",
    installCommand: "pnpm install --no-frozen-lockfile",
    buildCommand: "pnpm build",
    outputDirectory: ".next",
  };

  if (VERCEL_GITHUB_REPO) {
    body.gitRepository = { type: "github", repo: VERCEL_GITHUB_REPO };
  }

  const res = await fetch(`https://api.vercel.com/v10/projects${teamQuery}`, {
    method: "POST",
    headers: vercelHeaders(),
    body: JSON.stringify(body),
  });

  let data: Record<string, any>;
  try {
    data = await res.json();
  } catch {
    throw new Error("Unexpected response from Vercel API while creating project");
  }

  if (!res.ok) {
    if (data?.error?.code === "project_already_exists") {
      return await findExistingVercelProject(name);
    }
    throw new Error(data?.error?.message ?? "Failed to create Vercel project");
  }

  return data.id as string;
}

/**
 * Upserts environment variables on a Vercel project so they are available at runtime.
 * Uses POST to create and PATCH to update existing variables.
 */
export async function upsertVercelEnvVars(
  projectId: string,
  vars: Record<string, string>
): Promise<void> {
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : "";

  // Fetch existing env vars to know which ones need PATCH vs POST
  const listRes = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`,
    { headers: vercelHeaders() }
  );
  const listData = listRes.ok ? await listRes.json() : { envs: [] };
  const existing: Record<string, string> = {};
  for (const e of listData.envs ?? []) {
    existing[e.key] = e.id;
  }

  await Promise.all(
    Object.entries(vars).map(async ([key, value]) => {
      const body = JSON.stringify({
        key,
        value,
        type: "plain",
        target: ["production"],
      });

      if (existing[key]) {
        const patchRes = await fetch(
          `https://api.vercel.com/v9/projects/${projectId}/env/${existing[key]}${teamQuery}`,
          {
            method: "PATCH",
            headers: vercelHeaders(),
            // Only send updatable fields — key and type cannot be changed
            body: JSON.stringify({ value, target: ["production"] }),
          }
        );
        if (!patchRes.ok) {
          const err = await patchRes.json().catch(() => ({}));
          throw new Error(`Failed to update env var ${key}: ${err?.error?.message ?? patchRes.status}`);
        }
      } else {
        const postRes = await fetch(
          `https://api.vercel.com/v9/projects/${projectId}/env${teamQuery}`,
          { method: "POST", headers: vercelHeaders(), body }
        );
        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}));
          throw new Error(`Failed to create env var ${key}: ${err?.error?.message ?? postRes.status}`);
        }
      }
    })
  );
}

async function findExistingVercelProject(name: string): Promise<string> {
  const teamQuery = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : "";
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${name}${teamQuery}`,
    { headers: vercelHeaders() }
  );

  if (!res.ok) {
    throw new Error(`Vercel project "${name}" already exists but could not be retrieved`);
  }

  const data = await res.json();
  return data.id as string;
}