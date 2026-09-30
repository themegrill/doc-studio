"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RevisionDetail } from "@doc-studio/core";
import type { DocContent } from "@/lib/db/ContentManager";
import { EditingProvider, useEditing } from "@/contexts/EditingContext";
import DocRendererClient from "./DocRendererClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
export default function RevisionEditorClient(props: {
	projectSlug: string;
	initial: RevisionDetail;
	preview?: boolean;
}) {
	return (
		<EditingProvider>
			<Editor {...props} />
		</EditingProvider>
	);
}
function Editor({
	projectSlug,
	initial,
	preview = false,
}: {
	projectSlug: string;
	initial: RevisionDetail;
	preview?: boolean;
}) {
	const [revision, setRevision] = useState(initial),
		[productVersion, setProductVersion] = useState(
			initial.productVersion ?? "",
		),
		[releaseNote, setReleaseNote] = useState(initial.releaseNote ?? ""),
		[busy, setBusy] = useState(false),
		[error, setError] = useState(""),
		[ready, setReady] = useState(false),
		[confirm, setConfirm] = useState<"publish" | "discard" | null>(null);
	const revisionRef = useRef(initial),
		metadataRef = useRef({
			productVersion: initial.productVersion ?? "",
			releaseNote: initial.releaseNote ?? "",
		});
	const router = useRouter();
	const editing = useEditing();
	const { setIsEditing, setIsDirty, onSave, guidelineWarnings } = editing;
	const editable =
		!preview &&
		revision.canEdit &&
		["draft", "ready"].includes(revision.status);
	const base = `/projects/${encodeURIComponent(projectSlug)}/revisions/${revision.documentId}`,
		api = `/api/projects/${encodeURIComponent(projectSlug)}/documents/${revision.documentId}/revisions/${revision.id}`;
	useEffect(() => {
		setIsEditing(editable);
	}, [editable, setIsEditing]);
	const apply = useCallback((next: RevisionDetail) => {
		revisionRef.current = next;
		setRevision(next);
	}, []);
	const request = useCallback(
		async (suffix: string, body: unknown, method = "POST") => {
			const r = await fetch(api + suffix, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = await r.json();
			if (!r.ok) throw new Error(data.error ?? "Request failed");
			return data;
		},
		[api],
	);
	const save = useCallback(
		async (
			snapshot: Pick<
				DocContent,
				"title" | "description" | "blocks" | "seo"
			>,
		) => {
			const next = await request(
				"",
				{
					...snapshot,
					...metadataRef.current,
					expectedEditVersion: revisionRef.current.editVersion,
				},
				"PATCH",
			);
			apply(next);
		},
		[request, apply],
	);
	const adapter = useMemo(() => ({ save, onReady: setReady }), [save]);
	// Keep initial content stable while typing/saving. The renderer owns unsaved content.
	const doc = useMemo<DocContent>(
		() => ({
			id: initial.documentId,
			slug: initial.currentSlug,
			title: initial.title,
			description: initial.description ?? "",
			blocks: initial.blocks,
			seo: initial.seo,
			published: initial.wasPublished,
			updatedAt: initial.updatedAt,
		}),
		[initial],
	);
	async function perform(
		action: "save" | "ready" | "publish" | "discard" | "preview",
	) {
		if (busy || !ready) return;
		setBusy(true);
		setError("");
		try {
			const markReady = revisionRef.current.status !== "ready";
			if (action !== "discard" && (editing.isDirty || action === "save"))
				await onSave();
			const current = revisionRef.current;
			if (action === "ready")
				apply(
					await request("/ready", {
						expectedEditVersion: current.editVersion,
						ready: markReady,
					}),
				);
			if (action === "publish") {
				await request("/publish", {
					expectedEditVersion: current.editVersion,
					expectedDocumentVersion: current.baseDocumentVersion,
				});
				setIsDirty(false);
				router.push(base);
				return;
			}
			if (action === "discard") {
				await request("/discard", {
					expectedEditVersion: current.editVersion,
				});
				setIsDirty(false);
				router.push(base);
				return;
			}
			if (action === "preview") {
				router.push(`${base}/${current.id}/preview`);
			}
			setConfirm(null);
		} catch (e) {
			setConfirm(null);
			setError(e instanceof Error ? e.message : "Action failed");
		} finally {
			setBusy(false);
		}
	}
	return (
		<main className="max-w-5xl mx-auto px-6 py-8 space-y-5">
			<div className="flex flex-wrap gap-4 text-sm">
				<Link className="text-blue-700 hover:underline" href={base}>
					← Revisions &amp; history
				</Link>
				<Link
					className="text-blue-700 hover:underline"
					href={`/projects/${projectSlug}/docs/${revision.currentSlug}`}
				>
					Current document
				</Link>
				{preview && (
					<Link
						className="text-blue-700 hover:underline"
						href={`${base}/${revision.id}`}
					>
						Back to revision
					</Link>
				)}
			</div>
			<div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
				<h1 className="text-lg font-semibold">
					{preview
						? "Private revision preview"
						: `Revision ${revision.revisionNumber} · ${revision.status}`}
				</h1>
				<p className="text-sm">
					{["draft", "ready"].includes(revision.status)
						? "Draft revision — current document is unchanged."
						: "Historical snapshot — this content is read-only."}
				</p>
			</div>
			{revision.baseDocumentVersion !== revision.currentDocumentVersion &&
				editable && (
					<p className="rounded border border-amber-300 p-3 text-sm">
						Current content has changed since this revision was
						created. You can keep saving this draft; publication
						requires creating a fresh revision from current content
						and reapplying your changes.
					</p>
				)}
			{error && (
				<div
					role="alert"
					className="rounded border border-red-300 bg-red-50 p-3 text-red-800"
				>
					{error}
					<p className="text-sm mt-1">
						Your unsaved content is still here. Copy it before
						reloading or creating a fresh revision.
					</p>
				</div>
			)}
			{editable ? (
				<>
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<Label htmlFor="product-version">
								Product version (optional)
							</Label>
							<Input
								id="product-version"
								maxLength={200}
								disabled={busy}
								value={productVersion}
								onChange={(e) => {
									metadataRef.current.productVersion =
										e.target.value;
									setProductVersion(e.target.value);
									setIsDirty(true);
								}}
							/>
						</div>
						<div>
							<Label htmlFor="release-note">
								Release note (optional)
							</Label>
							<Textarea
								id="release-note"
								maxLength={10000}
								disabled={busy}
								value={releaseNote}
								onChange={(e) => {
									metadataRef.current.releaseNote =
										e.target.value;
									setReleaseNote(e.target.value);
									setIsDirty(true);
								}}
							/>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							disabled={busy || !ready}
							onClick={() => perform("save")}
						>
							{busy ? "Working…" : "Save revision"}
						</Button>
						<Button
							variant="outline"
							disabled={busy || !ready}
							onClick={() => perform("preview")}
						>
							Preview
						</Button>
						<Button
							variant="outline"
							disabled={busy || !ready}
							onClick={() => perform("ready")}
						>
							{revision.status === "ready"
								? "Return to draft"
								: "Mark ready"}
						</Button>
						{revision.canPublish && (
							<Button
								disabled={busy || !ready}
								onClick={() => setConfirm("publish")}
							>
								Publish revision
							</Button>
						)}
						<Button
							variant="outline"
							disabled={busy || !ready}
							onClick={() => setConfirm("discard")}
						>
							Discard
						</Button>
						<span className="self-center text-sm text-gray-500">
							{editing.isDirty ? "Unsaved changes" : "Saved"}
						</span>
					</div>
				</>
			) : (
				<p className="text-sm text-gray-600">
					{revision.productVersion
						? `Product ${revision.productVersion}`
						: "No product version assigned"}
					{revision.releaseNote ? ` · ${revision.releaseNote}` : ""}
				</p>
			)}
			<div inert={busy}>
				<DocRendererClient
					doc={doc}
					slug={doc.slug}
					projectSlug={projectSlug}
					isSectionOverview={!doc.slug.includes("/")}
					readOnly={!editable}
					revisionAdapter={adapter}
				/>
			</div>
			<Dialog
				open={confirm !== null}
				onOpenChange={(open) => {
					if (!busy && !open) setConfirm(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{confirm === "publish"
								? "Publish revision?"
								: "Discard revision?"}
						</DialogTitle>
						<DialogDescription>
							{confirm === "publish"
								? `Revision ${revision.revisionNumber}${productVersion ? ` for ${productVersion}` : ""} will replace current content at the existing URL. Unsaved edits will be saved first.`
								: "This draft will become read-only. Current content will remain unchanged."}
						</DialogDescription>
					</DialogHeader>
					{confirm === "publish" && guidelineWarnings.length > 0 && (
						<div className="text-sm rounded bg-amber-50 p-3">
							<p className="font-medium">Editorial warnings</p>
							<ul className="list-disc pl-5">
								{guidelineWarnings.map((w, i) => (
									<li key={i}>{w}</li>
								))}
							</ul>
						</div>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							disabled={busy}
							onClick={() => setConfirm(null)}
						>
							Cancel
						</Button>
						<Button
							disabled={busy}
							onClick={() => confirm && perform(confirm)}
						>
							{busy
								? "Working…"
								: confirm === "publish"
									? "Publish revision"
									: "Discard revision"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</main>
	);
}
