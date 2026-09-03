import { auth } from "@/lib/auth";
import {
	documentService,
	domainErrorResponse,
	webActor,
} from "@/lib/documents/service";
import { NextRequest } from "next/server";

/**
 * List published documents for a project (used by Redirects settings combobox)
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ projectSlug: string }> },
) {
	const session = await auth();
	if (!session?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { projectSlug } = await params;
	try {
		const docs = await documentService().listDocuments(
			webActor(session.user.id),
			projectSlug,
			{ published: true },
		);
		return Response.json({ documents: docs });
	} catch (error) {
		return domainErrorResponse(error);
	}
}

/**
 * Create a new document under a section
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ projectSlug: string }> },
) {
	const session = await auth();
	if (!session?.user?.id) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { projectSlug } = await params;
	const {
		title,
		slug: rawSlug,
		sectionSlug: rawSectionSlug,
		description,
		position,
	} = await request.json();

	if (!title || !rawSlug || !rawSectionSlug) {
		return Response.json(
			{ error: "Title, slug, and sectionSlug are required" },
			{ status: 400 },
		);
	}

	try {
		const doc = await documentService().createDocument(
			webActor(session.user.id),
			projectSlug,
			{
				title,
				slug: rawSlug,
				section: rawSectionSlug,
				description,
				...(Number.isInteger(position) ? { position } : {}),
			},
		);
		return Response.json({ success: true, document: doc });
	} catch (error) {
		return domainErrorResponse(error);
	}
}
