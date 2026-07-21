import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { editorSchema } from "@/lib/blocknote-schema";
import { DocContextProvider } from "@/contexts/DocContext";
import type { Block } from "@/lib/api";

export async function renderDocToHTML(
	blocks: Block[],
	projectSlug?: string,
): Promise<string> {
	if (!blocks?.length) return "";

	const editor = ServerBlockNoteEditor.create({ schema: editorSchema });

	const html = await editor.withReactContext(
		({ children }: { children: React.ReactNode }) => (
			<DocContextProvider projectSlug={projectSlug}>
				{children}
			</DocContextProvider>
		),
		() => editor.blocksToFullHTML(blocks as any),
	);

	return html.replace(/href="doc:([^"]+)"/g, 'href="/$1"');
}
