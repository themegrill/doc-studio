import type { NextApiRequest, NextApiResponse } from "next";
import { renderDocToHTML } from "@/lib/render-doc-html";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "POST") {
		res.status(405).end();
		return;
	}
	const { blocks, projectSlug } = req.body;
	const html = await renderDocToHTML(blocks, projectSlug);
	res.status(200).json({ html });
}
