import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/postgres";
import {
  crawlPageBatch,
  refineBatch,
  getDomain,
  chunkArray,
  stripLargeFields,
  normalizeUrl,
  MAX_PAGES,
  CRAWL_BATCH_SIZE,
  PAGE_BATCH_SIZE,
  type KnowledgeBaseItem,
  type RefinedKnowledgeBatch,
} from "@/lib/crawl-engine";

// Debounce: skip processing if a batch was started within the last 5 seconds.
// Prevents duplicate work from concurrent poll requests.
const DEBOUNCE_MS = 5_000;
const MAX_QUEUE_MULTIPLIER = 3;

interface CrawlSessionMeta {
  project_slug: string;
  start_url: string;
  status: string;
  visited_count: number;
  raw_pages_count: number;
  current_refine_batch: number;
  total_refine_batches: number;
  progress: number;
  message: string;
  error: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

function toProgressResponse(session: CrawlSessionMeta) {
  return {
    status: session.status,
    visitedPages: session.visited_count,
    maxPages: MAX_PAGES,
    currentBatch: session.current_refine_batch,
    totalBatches: session.total_refine_batches,
    progress: session.progress,
    message: session.message,
    error: session.error,
    startedAt: session.started_at,
    completedAt: session.completed_at,
  };
}

type SqlJsonInput = Parameters<ReturnType<typeof getDb>["json"]>[0];

function asJson<T>(value: T): SqlJsonInput {
  return value as unknown as SqlJsonInput;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectSlug: string }> }
) {
  const { projectSlug } = await params;
  const sql = getDb();

  // Fetch metadata only (no large JSONB columns)
  const [session] = await sql<CrawlSessionMeta[]>`
    SELECT project_slug, start_url, status,
           visited_count, raw_pages_count,
           current_refine_batch, total_refine_batches,
           progress, message, error, started_at, updated_at, completed_at
    FROM crawl_sessions
    WHERE project_slug = ${projectSlug}
  `;

  if (!session) {
    return NextResponse.json({
      status: "idle",
      progress: 0,
      message: "Not started",
    });
  }

  // Terminal states — just return current state
  if (["done", "error", "cancelled"].includes(session.status)) {
    return NextResponse.json(toProgressResponse(session));
  }

  // Debounce: if another request recently started a batch, skip processing
  const msSinceUpdate = Date.now() - new Date(session.updated_at).getTime();
  if (msSinceUpdate < DEBOUNCE_MS) {
    return NextResponse.json(toProgressResponse(session));
  }

  // ── Crawling phase ──────────────────────────────────────────────────────────
  if (session.status === "crawling") {
    const [data] = await sql<
      { queue_urls: string[]; visited_urls: string[] }[]
    >`
      SELECT queue_urls, visited_urls FROM crawl_sessions WHERE project_slug = ${projectSlug}
    `;

    const queueUrls: string[] = data.queue_urls ?? [];
    const visitedUrls: string[] = data.visited_urls ?? [];
    const visitedSet = new Set(visitedUrls);
    const batch = queueUrls.slice(0, CRAWL_BATCH_SIZE);

    const shouldTransition = batch.length === 0 || visitedSet.size >= MAX_PAGES;

    if (shouldTransition) {
      // Move to refining phase
      const [rawData] = await sql<{ raw_pages: KnowledgeBaseItem[] }[]>`
        SELECT raw_pages FROM crawl_sessions WHERE project_slug = ${projectSlug}
      `;
      const rawPages: KnowledgeBaseItem[] = rawData.raw_pages ?? [];

      if (rawPages.length === 0) {
        await sql`
          UPDATE crawl_sessions SET
            status = 'error', progress = 0,
            message = 'No pages crawled.',
            error = 'Crawl returned 0 pages.',
            completed_at = NOW(), updated_at = NOW()
          WHERE project_slug = ${projectSlug}
        `;
        return NextResponse.json({
          ...toProgressResponse(session),
          status: "error",
          progress: 0,
          message: "No pages crawled.",
          error: "Crawl returned 0 pages.",
        });
      }

      const totalBatches = Math.ceil(rawPages.length / PAGE_BATCH_SIZE);
      await sql`
        UPDATE crawl_sessions SET
          status = 'refining', total_refine_batches = ${totalBatches},
          progress = 50, message = 'Starting AI refinement...',
          updated_at = NOW()
        WHERE project_slug = ${projectSlug}
      `;
      return NextResponse.json({
        ...toProgressResponse(session),
        status: "refining",
        progress: 50,
        message: "Starting AI refinement...",
        totalBatches,
        currentBatch: 0,
      });
    }

    // Mark as "in progress" immediately to debounce concurrent requests
    await sql`UPDATE crawl_sessions SET updated_at = NOW() WHERE project_slug = ${projectSlug}`;

    const baseDomain = getDomain(session.start_url);
    const result = await crawlPageBatch(batch, baseDomain, visitedSet);

    // Build updated queue: remove crawled batch, append new discovered links
    const remainingQueue = queueUrls.slice(CRAWL_BATCH_SIZE);
    const existingSet = new Set([...visitedUrls, ...batch, ...queueUrls]);
    const newLinks = result.discoveredLinks.filter((url) => {
      const norm = normalizeUrl(url);
      return norm !== null && !existingSet.has(norm);
    });
    const newQueue = [...remainingQueue, ...newLinks].slice(
      0,
      MAX_PAGES * MAX_QUEUE_MULTIPLIER - visitedUrls.length - batch.length
    );
    const newVisited = [...visitedUrls, ...batch];
    const newVisitedCount = newVisited.length;

    // Fetch existing raw pages to append
    const [rawData] = await sql<{ raw_pages: KnowledgeBaseItem[] }[]>`
      SELECT raw_pages FROM crawl_sessions WHERE project_slug = ${projectSlug}
    `;
    const existingRawPages: KnowledgeBaseItem[] = rawData.raw_pages ?? [];
    const newRawPages = [...existingRawPages, ...result.crawled];
    const newProgress = Math.min(
      Math.round((newVisitedCount / MAX_PAGES) * 50),
      49
    );

    await sql`
      UPDATE crawl_sessions SET
        queue_urls      = ${sql.json(asJson(newQueue))},
        visited_urls    = ${sql.json(asJson(newVisited))},
        raw_pages       = ${sql.json(asJson(newRawPages))},
        visited_count   = ${newVisitedCount},
        raw_pages_count = ${newRawPages.length},
        progress        = ${newProgress},
        message         = ${
          "Crawling pages... (" + newVisitedCount + "/" + MAX_PAGES + ")"
        },
        updated_at      = NOW()
      WHERE project_slug = ${projectSlug}
    `;

    return NextResponse.json({
      ...toProgressResponse(session),
      status: "crawling",
      visitedPages: newVisitedCount,
      progress: newProgress,
      message: `Crawling pages... (${newVisitedCount}/${MAX_PAGES})`,
    });
  }

  // ── Refining phase ──────────────────────────────────────────────────────────
  if (session.status === "refining") {
    const batchIndex = session.current_refine_batch;
    const totalBatches = session.total_refine_batches;

    if (batchIndex >= totalBatches) {
      // All batches done — save final KB to project_knowledge_bases
      const [refinedData] = await sql<
        { refined_batches: RefinedKnowledgeBatch[] }[]
      >`
        SELECT refined_batches FROM crawl_sessions WHERE project_slug = ${projectSlug}
      `;
      const refinedBatches: RefinedKnowledgeBatch[] =
        refinedData.refined_batches ?? [];

      const [project] = await sql<{ id: string }[]>`
        SELECT id FROM projects WHERE slug = ${projectSlug}
      `;

      if (!project) {
        await sql`
          UPDATE crawl_sessions SET
            status = 'error', message = 'Project not found.',
            error = 'Project not found.', completed_at = NOW(), updated_at = NOW()
          WHERE project_slug = ${projectSlug}
        `;
        return NextResponse.json(
          { status: "error", message: "Project not found." },
          { status: 404 }
        );
      }

      await sql`
        INSERT INTO project_knowledge_bases (project_id, type, content, metadata)
        VALUES (
          ${project.id}, 'website',
          ${sql.json(asJson(refinedBatches))},
          ${sql.json(asJson({ siteLink: session.start_url }))}
        )
        ON CONFLICT (project_id, type) DO UPDATE SET
          content    = EXCLUDED.content,
          metadata   = EXCLUDED.metadata,
          updated_at = NOW()
      `;

      await sql`
        UPDATE crawl_sessions SET
          status = 'done', progress = 100,
          message = 'Knowledge base ready.',
          completed_at = NOW(), updated_at = NOW()
        WHERE project_slug = ${projectSlug}
      `;

      return NextResponse.json({
        ...toProgressResponse(session),
        status: "done",
        progress: 100,
        message: "Knowledge base ready.",
        currentBatch: totalBatches,
        totalBatches,
      });
    }

    // Mark as "in progress" to debounce concurrent requests
    await sql`UPDATE crawl_sessions SET updated_at = NOW() WHERE project_slug = ${projectSlug}`;

    // Fetch raw pages for this batch
    const [rawData] = await sql<
      {
        raw_pages: KnowledgeBaseItem[];
        refined_batches: RefinedKnowledgeBatch[];
      }[]
    >`
      SELECT raw_pages, refined_batches FROM crawl_sessions WHERE project_slug = ${projectSlug}
    `;

    const rawPages: KnowledgeBaseItem[] = rawData.raw_pages ?? [];
    const existingRefined: RefinedKnowledgeBatch[] =
      rawData.refined_batches ?? [];
    const batches = chunkArray(rawPages.map(stripLargeFields), PAGE_BATCH_SIZE);
    const pageBatch = batches[batchIndex];

    let refined: RefinedKnowledgeBatch;
    try {
      refined = await refineBatch(pageBatch, batchIndex + 1, totalBatches);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sql`
        UPDATE crawl_sessions SET
          status = 'error', message = ${"AI refinement failed: " + message},
          error = ${message}, completed_at = NOW(), updated_at = NOW()
        WHERE project_slug = ${projectSlug}
      `;
      return NextResponse.json(
        { status: "error", message: `AI refinement failed: ${message}` },
        { status: 500 }
      );
    }

    const newRefined = [...existingRefined, refined];
    const nextBatch = batchIndex + 1;
    const refineProgress = 50 + Math.round((nextBatch / totalBatches) * 50);

    await sql`
      UPDATE crawl_sessions SET
        refined_batches      = ${sql.json(asJson(newRefined))},
        current_refine_batch = ${nextBatch},
        progress             = ${refineProgress},
        message              = ${
          "Refining with AI... (batch " + nextBatch + "/" + totalBatches + ")"
        },
        updated_at           = NOW()
      WHERE project_slug = ${projectSlug}
    `;

    return NextResponse.json({
      ...toProgressResponse(session),
      status: "refining",
      progress: refineProgress,
      message: `Refining with AI... (batch ${nextBatch}/${totalBatches})`,
      currentBatch: nextBatch,
      totalBatches,
    });
  }

  return NextResponse.json(toProgressResponse(session));
}
