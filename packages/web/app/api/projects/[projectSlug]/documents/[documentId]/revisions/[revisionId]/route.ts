import { revisionApi } from "@/lib/documents/revisions";
export const dynamic = "force-dynamic";
type Context = {
	params: Promise<{
		projectSlug: string;
		documentId: string;
		revisionId?: string;
	}>;
};
export async function GET(request: Request, { params }: Context) {
	return revisionApi(request, await params, "get");
}
export async function PATCH(request: Request, { params }: Context) {
	return revisionApi(request, await params, "patch");
}
