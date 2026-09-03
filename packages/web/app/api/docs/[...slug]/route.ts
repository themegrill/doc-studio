import { NextRequest, NextResponse } from "next/server";
import { ContentManager } from "@/lib/db/ContentManager";
import { auth } from "@/lib/auth";
import { getProjectFromRequest } from "@/lib/project-helpers";
import {
	documentService,
	domainErrorResponse,
	webActor,
} from "@/lib/documents/service";

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> },
) {
	try {
		const resolvedParams = await params;
		const slug = resolvedParams.slug.join("/");

		const hostname = request.headers.get("host") || "localhost";

		// Prefer explicit projectSlug query param (e.g. from packages/client server-side calls
		// that have no Referer); fall back to Referer-based detection used by the web app.
		const { searchParams } = new URL(request.url);
		const projectSlugParam = searchParams.get("projectSlug");
		let pathname = `/docs/${slug}`;
		if (projectSlugParam) {
			pathname = `/projects/${projectSlugParam}/docs/${slug}`;
		} else {
			const referer = request.headers.get("referer") || "";
			if (referer) {
				try {
					pathname = new URL(referer).pathname;
				} catch {
					// fallback to default
				}
			}
		}

		const project = await getProjectFromRequest(hostname, pathname);
		if (!project) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}

		const cm = ContentManager.create();
		const docContent = await cm.getDoc(project.id, slug);

		if (!docContent) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}

		return NextResponse.json(docContent);
	} catch (error: unknown) {
		const err = error as Error;
		const resolvedParams = await params;
		console.error("[GET /api/docs] Error retrieving document:", {
			slug: resolvedParams.slug.join("/"),
			error: err.message,
			stack: err.stack,
		});
		return NextResponse.json({ error: err.message }, { status: 500 });
	}
}

export async function PUT(
	request: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> },
) {
	try {
		const resolvedParams = await params;
		const slug = resolvedParams.slug.join("/");
		// Check authentication with NextAuth
		const session = await auth();

		if (!session?.user) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 },
			);
		}

		const body = await request.json();

		// Get project from request context (hostname/path)
		const hostname = request.headers.get("host") || "localhost";

		// Try to get the actual page path from Referer header
		const referer = request.headers.get("referer") || "";
		let pathname = `/docs/${slug}`;

		if (referer) {
			try {
				const refererUrl = new URL(referer);
				pathname = refererUrl.pathname;
			} catch (e) {
				// Fallback to default pathname
			}
		}

		const project = await getProjectFromRequest(hostname, pathname);

		if (!project) {
			return NextResponse.json(
				{ error: "Project not found" },
				{ status: 404 },
			);
		}

		const service = documentService();
		const actor = webActor(session.user.id!);
		const current = await service.getDocument(
			actor,
			project.slug,
			{ slug },
			false,
		);
		const patch = {
			...(Object.hasOwn(body, "title") ? { title: body.title } : {}),
			...(Object.hasOwn(body, "description")
				? { description: body.description }
				: {}),
			...(Object.hasOwn(body, "blocks") ? { blocks: body.blocks } : {}),
			...(Object.hasOwn(body, "seo") ? { seo: body.seo } : {}),
			...(typeof body.published === "boolean"
				? { published: body.published }
				: {}),
			...(typeof body.newSlug === "string" && body.newSlug.trim() !== slug
				? { newSlug: body.newSlug.trim() }
				: {}),
			...(body.expectedUpdatedAt
				? { expectedUpdatedAt: body.expectedUpdatedAt }
				: {}),
		};
		const updated = await service.patchDocument(
			actor,
			project.slug,
			current.id as string,
			patch,
		);
		return NextResponse.json({ success: true, slug: updated.slug });
	} catch (error: unknown) {
		return domainErrorResponse(error);
	}
}

export async function DELETE(
	request: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> },
) {
	try {
		const resolvedParams = await params;
		const slug = resolvedParams.slug.join("/");

		const session = await auth();
		if (!session?.user) {
			return NextResponse.json(
				{ error: "Unauthorized" },
				{ status: 401 },
			);
		}

		const hostname = request.headers.get("host") || "localhost";

		// Prefer explicit projectSlug query param (sent by client); fall back to Referer.
		const { searchParams } = new URL(request.url);
		const projectSlugParam = searchParams.get("projectSlug");
		let pathname = `/docs/${slug}`;
		if (projectSlugParam) {
			pathname = `/projects/${projectSlugParam}/docs/${slug}`;
		} else {
			const referer = request.headers.get("referer") || "";
			if (referer) {
				try {
					pathname = new URL(referer).pathname;
				} catch {
					// fallback to default
				}
			}
		}

		const project = await getProjectFromRequest(hostname, pathname);
		if (!project) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}

		const service = documentService();
		const actor = webActor(session.user.id!);
		const doc = await service.getDocument(
			actor,
			project.slug,
			{ slug },
			false,
		);
		await service.trashDocument(actor, project.slug, doc.id as string);

		return NextResponse.json({ success: true });
	} catch (error: unknown) {
		return domainErrorResponse(error);
	}
}
