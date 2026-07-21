import type { NextApiRequest, NextApiResponse } from "next";
import { renderDocToHTML } from "@/lib/render-doc-html";

/**
 * Converts BlockNote blocks to static HTML server-side. Lives under the
 * Pages Router (pages/api), not app/api — @blocknote/react's module graph
 * calls React.createContext at module-eval time, which Next's React Server
 * Components build (applied to everything under app/, including Route
 * Handlers) forbids outside "use client" boundaries. Pages Router API routes
 * predate RSC and use the regular React build, so this works there.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const { blocks, projectSlug } = req.body;
  const html = await renderDocToHTML(blocks, projectSlug);
  res.status(200).json({ html });
}
