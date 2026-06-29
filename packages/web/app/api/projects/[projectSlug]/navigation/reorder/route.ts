import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/postgres";
import { checkProjectAccess } from "@/lib/project-helpers";
import { NextRequest } from "next/server";

interface Redirect {
  from: string;
  to: string;
}

/**
 * Reorder navigation sections and documents.
 *
 * Doc hierarchy is encoded in the document slug (`<section>/<topic>`), and the
 * breadcrumb + public URL are derived from that slug. So when a topic is moved to
 * a different section we must also rewrite its slug to match the new section —
 * otherwise the breadcrumb/URL keep showing the old category (DOCSTUDIO-21).
 * We reconcile every topic's slug with the section it now sits under, rewrite the
 * matching nav node's path/slug, and add a redirect from the old URL to the new one
 * (client middleware honors `projects.redirects`).
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { structure } = (await request.json()) as { structure: any };

  if (!structure || !structure.routes) {
    return Response.json(
      { error: "Invalid navigation structure" },
      { status: 400 }
    );
  }

  const sql = getDb();

  // Get project (incl. existing redirects so we can append on move)
  const [project] = await sql`
    SELECT id, redirects FROM projects WHERE slug = ${projectSlug}
  `;

  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // Check access
  const hasAccess = await checkProjectAccess(
    session.user.id,
    project.id,
    "editor"
  );
  if (!hasAccess) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // ── Reconcile topic slugs with their (possibly new) section ──────────────
    const docs = await sql`
      SELECT id, slug FROM documents WHERE project_id = ${project.id}
    `;
    const slugById = new Map<string, string>(
      docs.map((d) => [d.id as string, d.slug as string])
    );
    // Live set of all slugs, used for collision-safe renames.
    const usedSlugs = new Set<string>(docs.map((d) => d.slug as string));

    const stripDocs = (p?: string | null) =>
      (p ?? "").replace(/^\/docs\//, "").replace(/^\/docs$/, "");

    // { id, oldSlug, newSlug } for each topic that actually moved category
    const slugChanges: Array<{ id: string; oldSlug: string; newSlug: string }> = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const route of structure.routes as any[]) {
      const sectionSlug = (route.slug ?? stripDocs(route.path)).split("/")[0];
      if (!sectionSlug || !Array.isArray(route.children)) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const child of route.children as any[]) {
        // Resolve the DB doc: prefer the stable id, fall back to current slug.
        const dbSlug =
          (child.id && slugById.get(child.id)) ??
          child.slug ??
          stripDocs(child.path);
        if (!dbSlug) continue;
        const docId =
          child.id ??
          docs.find((d) => d.slug === dbSlug)?.id;
        if (!docId) continue;

        const topicPart = dbSlug.includes("/")
          ? dbSlug.slice(dbSlug.indexOf("/") + 1)
          : dbSlug;
        let desiredSlug = `${sectionSlug}/${topicPart}`;

        if (desiredSlug === dbSlug) {
          // No category change — just keep the node's path/slug in sync.
          child.path = `/docs/${dbSlug}`;
          child.slug = dbSlug;
          continue;
        }

        // Collision-safe: append -2, -3, … if the target slug is taken by another doc.
        if (usedSlugs.has(desiredSlug)) {
          let n = 2;
          while (usedSlugs.has(`${sectionSlug}/${topicPart}-${n}`)) n++;
          desiredSlug = `${sectionSlug}/${topicPart}-${n}`;
        }

        usedSlugs.delete(dbSlug);
        usedSlugs.add(desiredSlug);
        slugById.set(docId, desiredSlug);
        slugChanges.push({ id: docId, oldSlug: dbSlug, newSlug: desiredSlug });

        // Rewrite the node in the structure that gets persisted.
        child.path = `/docs/${desiredSlug}`;
        child.slug = desiredSlug;
        child.id = docId;
      }
    }

    // Apply slug changes to the documents table.
    for (const { id, newSlug } of slugChanges) {
      await sql`
        UPDATE documents SET slug = ${newSlug} WHERE id = ${id} AND project_id = ${project.id}
      `;
    }

    // Persist the (possibly rewritten) navigation structure.
    await sql`
      UPDATE navigation
      SET
        structure = ${sql.json(structure)},
        updated_by = ${session.user.id}
      WHERE project_id = ${project.id}
    `;

    // ── Maintain redirects so old front-end URLs keep working ────────────────
    if (slugChanges.length > 0) {
      // Front-end (client) URLs drop the "/docs" prefix → topic URL is "/<slug>".
      const existing: Redirect[] = Array.isArray(project.redirects)
        ? (project.redirects as Redirect[])
        : [];
      const byFrom = new Map<string, string>();
      for (const r of existing) {
        if (typeof r?.from === "string" && typeof r?.to === "string") {
          byFrom.set(r.from.split("?")[0].split("#")[0], r.to);
        }
      }

      for (const { oldSlug, newSlug } of slugChanges) {
        const from = `/${oldSlug}`;
        const to = `/${newSlug}`;
        // Collapse chains: any redirect that pointed at the old URL now points at the new one.
        for (const [k, v] of byFrom) {
          if (v === from) byFrom.set(k, to);
        }
        byFrom.set(from, to);
      }

      // Drop no-op redirects (e.g. moved back to original category).
      const merged: Redirect[] = Array.from(byFrom.entries())
        .filter(([from, to]) => from !== to)
        .map(([from, to]) => ({ from, to }));

      await sql`
        UPDATE projects
        SET redirects = ${sql.json(merged)}, updated_at = NOW()
        WHERE id = ${project.id}
      `;
    }

    return Response.json({ success: true, structure });
  } catch (error) {
    console.error("Error updating navigation order:", error);
    return Response.json(
      { error: "Failed to update navigation order" },
      { status: 500 }
    );
  }
}
