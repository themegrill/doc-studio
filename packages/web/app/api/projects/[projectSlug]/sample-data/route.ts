import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

/**
 * Sample-data tool (Settings → Sample Data tab).
 * POST  = seed comprehensive sample data into this project so every feature can be tested.
 * DELETE = remove ONLY sample-tagged data (never touches real content).
 *
 * Everything created here is tagged for safe cleanup:
 *  - documents: known SAMPLE_SLUGS
 *  - knowledge bases / ai_usage_logs: metadata._sample = true
 *  - users: @sample.docstudio emails
 *  - redirects: known SAMPLE_REDIRECT from-paths
 */

const SAMPLE_USER_DOMAIN = "@sample.docstudio";
const SAMPLE_USER_PASSWORD = "Sample123";

// section slug -> { title, topics: [{ slug(topic part), title }] }
const SAMPLE_SECTIONS: {
  slug: string;
  title: string;
  topics: { slug: string; title: string }[];
}[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    topics: [
      { slug: "installation", title: "Installation" },
      { slug: "configuration", title: "Configuration" },
      { slug: "quick-start", title: "Quick Start" },
    ],
  },
  {
    slug: "user-guides",
    title: "User Guides",
    topics: [
      { slug: "managing-users", title: "Managing Users" },
      { slug: "membership-plans", title: "Membership Plans" },
      { slug: "payment-setup", title: "Payment Setup" },
      { slug: "email-notifications", title: "Email Notifications" },
    ],
  },
  {
    slug: "advanced",
    title: "Advanced",
    topics: [
      { slug: "rest-api", title: "REST API" },
      { slug: "webhooks", title: "Webhooks" },
    ],
  },
  // Intentionally empty category — for testing empty-section drops, etc.
  { slug: "troubleshooting", title: "Troubleshooting", topics: [] },
];

const SAMPLE_REDIRECTS = [
  { from: "/old/install", to: "/getting-started/installation" },
  { from: "/docs/legacy-api", to: "/advanced/rest-api" },
];

const SAMPLE_USERS = [
  { name: "Sample Editor", local: "editor", role: "editor" as const },
  { name: "Sample Viewer", local: "viewer", role: "viewer" as const },
  { name: "Sample Admin", local: "admin", role: "admin" as const },
];

// Per-1M-token pricing (USD) for a rough estimated_cost.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4": { input: 15, output: 75 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.25, output: 1.25 },
};

const SAMPLE_AI_LOGS = [
  { feature: "chat", model: "claude-sonnet-4-5", prompt: 820, completion: 1450, ok: true, dur: 2600 },
  { feature: "title-generation", model: "claude-haiku-4-5", prompt: 240, completion: 60, ok: true, dur: 700 },
  { feature: "description-generation", model: "claude-haiku-4-5", prompt: 300, completion: 90, ok: true, dur: 820 },
  { feature: "document-generation", model: "claude-sonnet-4-5", prompt: 1250, completion: 3400, ok: true, dur: 3150 },
  { feature: "chat", model: "claude-opus-4", prompt: 1100, completion: 2200, ok: false, dur: 1900 },
];

const para = (text: string) => [
  { id: "b1", type: "paragraph", props: {}, content: [{ type: "text", text, styles: {} }], children: [] },
];

const allSampleSlugs = () => {
  const slugs: string[] = [];
  for (const s of SAMPLE_SECTIONS) {
    slugs.push(s.slug);
    for (const t of s.topics) slugs.push(`${s.slug}/${t.slug}`);
  }
  return slugs;
};

async function resolveProjectAndAuth(projectSlug: string) {
  // Local/development only — this tool must never be exposed in production.
  if (process.env.NODE_ENV === "production") {
    return { error: "Not found", status: 404 as const };
  }
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized", status: 401 as const };
  const sql = getDb();
  const [user] = await sql`SELECT role FROM users WHERE id = ${session.user.id}`;
  const isSuperAdmin = user?.role === "super_admin" || user?.role === "admin";
  const [project] = await sql`SELECT id FROM projects WHERE slug = ${projectSlug} LIMIT 1`;
  if (!project) return { error: "Project not found", status: 404 as const };
  if (!isSuperAdmin) {
    const [membership] = await sql`
      SELECT role FROM project_members WHERE project_id = ${project.id} AND user_id = ${session.user.id}
    `;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return { error: "Forbidden", status: 403 as const };
    }
  }
  return { sql, projectId: project.id as string, userId: session.user.id as string };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  try {
    const { projectSlug } = await params;
    const ctx = await resolveProjectAndAuth(projectSlug);
    if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });
    const { sql, projectId, userId } = ctx;

    const created = { docs: 0, categories: 0, knowledgeBases: 0, members: 0, redirects: 0, aiLogs: 0 };

    // ── 1. Docs & categories ──────────────────────────────────────────────
    let order = 0;
    for (const section of SAMPLE_SECTIONS) {
      const secRes = await sql`
        INSERT INTO documents (project_id, slug, title, blocks, published, order_index, created_by, updated_by)
        VALUES (${projectId}, ${section.slug}, ${section.title},
                ${sql.json(para(`${section.title} overview.`))}, true, ${order++}, ${userId}, ${userId})
        ON CONFLICT (project_id, slug) DO NOTHING
        RETURNING id
      `;
      if (secRes.length) created.categories++;
      let tOrder = 0;
      for (const topic of section.topics) {
        const fullSlug = `${section.slug}/${topic.slug}`;
        const topRes = await sql`
          INSERT INTO documents (project_id, slug, title, blocks, published, order_index, seo, created_by, updated_by)
          VALUES (${projectId}, ${fullSlug}, ${topic.title},
                  ${sql.json(para(`Sample content for ${topic.title}.`))}, true, ${tOrder++},
                  ${sql.json({ metaTitle: `${topic.title} — ${section.title}`, metaDescription: `Learn about ${topic.title}.`, schemaType: "TechArticle" })},
                  ${userId}, ${userId})
          ON CONFLICT (project_id, slug) DO NOTHING
          RETURNING id
        `;
        if (topRes.length) created.docs++;
      }
    }

    // Merge sample sections into the navigation tree (append only what's missing).
    const idBySlug = new Map<string, string>();
    const rows = await sql`SELECT id, slug FROM documents WHERE project_id = ${projectId} AND slug = ANY(${allSampleSlugs()})`;
    for (const r of rows) idBySlug.set(r.slug as string, r.id as string);

    const [navRow] = await sql`SELECT id, structure FROM navigation WHERE project_id = ${projectId} ORDER BY updated_at DESC LIMIT 1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structure: any = navRow?.structure ?? { title: "Documentation", version: "1.0", routes: [] };
    if (!Array.isArray(structure.routes)) structure.routes = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingPaths = new Set(structure.routes.map((r: any) => r.path));
    for (const section of SAMPLE_SECTIONS) {
      const path = `/docs/${section.slug}`;
      if (existingPaths.has(path)) continue;
      structure.routes.push({
        path,
        title: section.title,
        children: section.topics.map((t) => ({
          id: idBySlug.get(`${section.slug}/${t.slug}`),
          path: `/docs/${section.slug}/${t.slug}`,
          slug: `${section.slug}/${t.slug}`,
          title: t.title,
        })),
      });
    }
    if (navRow) {
      await sql`UPDATE navigation SET structure = ${sql.json(structure)}, updated_by = ${userId}, updated_at = NOW() WHERE id = ${navRow.id}`;
    } else {
      await sql`INSERT INTO navigation (project_id, structure, updated_by) VALUES (${projectId}, ${sql.json(structure)}, ${userId})`;
    }

    // ── 2. Knowledge bases (one per type) ─────────────────────────────────
    const kbEntries: { type: string; content: unknown; metadata: Record<string, unknown> }[] = [
      {
        type: "upload",
        metadata: { _sample: true },
        content: {
          schema_version: "1.0",
          plugin: { name: "Sample Plugin", version: "1.0.0", author: "ThemeGrill", description: "A sample plugin for testing." },
          knowledge: {
            features: [{ title: "User Registration", description: "Custom registration forms.", source: "sample" }],
            use_cases: [{ title: "Membership site", description: "Gate content behind plans.", source: "sample" }],
            how_tos: [{ title: "Limit username length", description: "Use a filter.", steps: ["Open functions.php", "Add the filter", "Save"], source: "sample" }],
            components: ["Registration form", "Login form"],
            screens: [],
          },
        },
      },
      {
        type: "website",
        metadata: { _sample: true, siteLink: "https://example.com" },
        content: [{
          productSummary: { productName: "Sample Product", oneSentenceSummary: "Docs demo product.", whatItDoes: "Manages users & memberships.", targetUsers: ["site admins"] },
          features: [{ name: "Memberships", description: "Recurring plans." }],
          howTos: [{ title: "Create a plan", description: "Steps to add a plan.", steps: ["Go to Plans", "Add new", "Publish"] }],
        }],
      },
      {
        type: "codebase",
        metadata: { _sample: true, githubRepo: "themegrill/sample-plugin", branch: "main", filePath: "knowledge_base.json" },
        content: {
          schema_version: "1.0",
          plugin: { name: "Sample Plugin", version: "1.0.0", author: "ThemeGrill", description: "Codebase-derived KB." },
          knowledge: { features: [{ title: "Hooks", description: "Filters and actions.", source: "code" }], use_cases: [], how_tos: [], components: [], screens: [] },
        },
      },
      {
        type: "ui_flow",
        metadata: { _sample: true },
        content: {
          project: { name: "Sample Product" },
          screens: [{ screen_title: "Registration", screen_purpose: "Sign up", user_goal: "Create an account", primary_actions: ["Submit"], fields: [{ label: "Email", type: "email", required: true }] }],
          flows: [{ from: "Registration", to: "Dashboard", trigger: "submit", confidence: "high" }],
          components: ["Form", "Button"],
        },
      },
    ];
    for (const kb of kbEntries) {
      const res = await sql`
        INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
        VALUES (${projectId}, ${kb.type}, ${sql.json(kb.content as object)}, ${sql.json(kb.metadata)})
        ON CONFLICT (project_id, type) DO NOTHING
        RETURNING id
      `;
      if (res.length) created.knowledgeBases++;
    }

    // ── 3. Members (sample users + memberships) ───────────────────────────
    const hashed = await bcrypt.hash(SAMPLE_USER_PASSWORD, 10);
    for (const u of SAMPLE_USERS) {
      const email = `${u.local}${SAMPLE_USER_DOMAIN}`;
      await sql`
        INSERT INTO users (email, name, hashed_password, role)
        VALUES (${email}, ${u.name}, ${hashed}, 'user')
        ON CONFLICT (email) DO NOTHING
      `;
      const [su] = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (su) {
        const res = await sql`
          INSERT INTO project_members (project_id, user_id, role, created_by, updated_by)
          VALUES (${projectId}, ${su.id}, ${u.role}, ${userId}, ${userId})
          ON CONFLICT (project_id, user_id) DO NOTHING
          RETURNING id
        `;
        if (res.length) created.members++;
      }
    }

    // ── 4. Redirects ──────────────────────────────────────────────────────
    const [proj] = await sql`SELECT redirects FROM projects WHERE id = ${projectId}`;
    const existingRedirects: { from: string; to: string }[] = Array.isArray(proj?.redirects) ? proj.redirects : [];
    const byFrom = new Map<string, string>();
    for (const r of existingRedirects) byFrom.set(r.from, r.to);
    for (const r of SAMPLE_REDIRECTS) {
      if (!byFrom.has(r.from)) created.redirects++;
      byFrom.set(r.from, r.to);
    }
    const mergedRedirects = Array.from(byFrom.entries()).map(([from, to]) => ({ from, to }));
    await sql`UPDATE projects SET redirects = ${sql.json(mergedRedirects)}, updated_at = NOW() WHERE id = ${projectId}`;

    // ── 5. AI usage logs (idempotent: clear sample rows first) ────────────
    await sql`DELETE FROM ai_usage_logs WHERE project_id = ${projectId} AND metadata->>'_sample' = 'true'`;
    for (const log of SAMPLE_AI_LOGS) {
      const total = log.prompt + log.completion;
      const price = PRICING[log.model] ?? { input: 3, output: 15 };
      const cost = (log.prompt / 1e6) * price.input + (log.completion / 1e6) * price.output;
      await sql`
        INSERT INTO ai_usage_logs (user_id, feature, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, duration_ms, success, error_message, project_id, metadata)
        VALUES (${userId}, ${log.feature}, ${log.model}, ${log.prompt}, ${log.completion}, ${total}, ${cost.toFixed(6)}, ${log.dur}, ${log.ok}, ${log.ok ? null : "Sample error"}, ${projectId}, ${sql.json({ _sample: true })})
      `;
      created.aiLogs++;
    }

    return Response.json({ success: true, created });
  } catch (error) {
    console.error("[sample-data POST] error:", error);
    return Response.json({ error: "Failed to load sample data" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  try {
    const { projectSlug } = await params;
    const ctx = await resolveProjectAndAuth(projectSlug);
    if ("error" in ctx) return Response.json({ error: ctx.error }, { status: ctx.status });
    const { sql, projectId } = ctx;

    const removed = { docs: 0, knowledgeBases: 0, members: 0, users: 0, aiLogs: 0, redirects: 0 };

    // Docs (sections + topics) by known slugs.
    const delDocs = await sql`DELETE FROM documents WHERE project_id = ${projectId} AND slug = ANY(${allSampleSlugs()}) RETURNING id`;
    removed.docs = delDocs.length;

    // Strip sample sections from the navigation tree.
    const [navRow] = await sql`SELECT id, structure FROM navigation WHERE project_id = ${projectId} ORDER BY updated_at DESC LIMIT 1`;
    if (navRow?.structure) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const structure: any = navRow.structure;
      const samplePaths = new Set(SAMPLE_SECTIONS.map((s) => `/docs/${s.slug}`));
      if (Array.isArray(structure.routes)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        structure.routes = structure.routes.filter((r: any) => !samplePaths.has(r.path));
        await sql`UPDATE navigation SET structure = ${sql.json(structure)}, updated_at = NOW() WHERE id = ${navRow.id}`;
      }
    }

    // Knowledge bases + AI logs tagged _sample.
    const delKb = await sql`DELETE FROM project_knowledge_bases WHERE project_id = ${projectId} AND metadata->>'_sample' = 'true' RETURNING id`;
    removed.knowledgeBases = delKb.length;
    const delLogs = await sql`DELETE FROM ai_usage_logs WHERE project_id = ${projectId} AND metadata->>'_sample' = 'true' RETURNING id`;
    removed.aiLogs = delLogs.length;

    // Sample memberships, then the sample users themselves.
    const sampleUsers = await sql`SELECT id FROM users WHERE email LIKE ${"%" + SAMPLE_USER_DOMAIN}`;
    const sampleUserIds = sampleUsers.map((u) => u.id);
    if (sampleUserIds.length) {
      const delMembers = await sql`DELETE FROM project_members WHERE project_id = ${projectId} AND user_id = ANY(${sampleUserIds}) RETURNING id`;
      removed.members = delMembers.length;
      // Delete the sample users only if they no longer belong to any project.
      const delUsers = await sql`
        DELETE FROM users u WHERE u.email LIKE ${"%" + SAMPLE_USER_DOMAIN}
          AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.user_id = u.id)
        RETURNING id
      `;
      removed.users = delUsers.length;
    }

    // Remove the known sample redirects.
    const [proj] = await sql`SELECT redirects FROM projects WHERE id = ${projectId}`;
    if (Array.isArray(proj?.redirects)) {
      const sampleFrom = new Set(SAMPLE_REDIRECTS.map((r) => r.from));
      const kept = proj.redirects.filter((r: { from: string }) => !sampleFrom.has(r.from));
      removed.redirects = proj.redirects.length - kept.length;
      await sql`UPDATE projects SET redirects = ${sql.json(kept)}, updated_at = NOW() WHERE id = ${projectId}`;
    }

    return Response.json({ success: true, removed });
  } catch (error) {
    console.error("[sample-data DELETE] error:", error);
    return Response.json({ error: "Failed to clear sample data" }, { status: 500 });
  }
}
