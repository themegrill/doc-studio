"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RevisionList, RevisionSummary } from "@doc-studio/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const when = (value: string | null) =>
	value ? new Date(value).toLocaleString() : "Unknown";
export default function RevisionHistoryClient({
	projectSlug,
	initial,
}: {
	projectSlug: string;
	initial: RevisionList & { authorNames?: Record<string, string> };
}) {
	const [data, setData] = useState(initial),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	const router = useRouter();
	const base = `/projects/${encodeURIComponent(projectSlug)}/revisions/${data.current.id}`,
		api = `/api/projects/${encodeURIComponent(projectSlug)}/documents/${data.current.id}/revisions`;
	async function create(sourceRevisionId?: string) {
		setBusy(true);
		setError("");
		try {
			const r = await fetch(api, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sourceRevisionId }),
			});
			const body = await r.json();
			if (!r.ok) throw new Error(body.error);
			router.push(`${base}/${body.id}`);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Could not create revision",
			);
			setBusy(false);
		}
	}
	async function page(offset: number) {
		setBusy(true);
		setError("");
		try {
			const r = await fetch(
				`${api}?offset=${offset}&limit=${data.limit}`,
				{
					cache: "no-store",
				},
			);
			const body = await r.json();
			if (!r.ok) throw new Error(body.error);
			setData(body);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not load history");
		} finally {
			setBusy(false);
		}
	}
	function row(revision: RevisionSummary) {
		const staged = ["draft", "ready"].includes(revision.status);
		return (
			<li key={revision.id} className="border-t py-4 space-y-2">
				<div className="flex flex-wrap justify-between gap-2">
					<Link
						className="font-medium text-blue-700 hover:underline"
						href={`${base}/${revision.id}${staged ? "" : "/preview"}`}
					>
						Revision {revision.revisionNumber}: {revision.title}
					</Link>
					<span className="rounded-full bg-gray-100 px-2 py-1 text-xs capitalize">
						{revision.appliedDocumentVersion ===
						data.current.contentVersion
							? "Current · "
							: ""}
						{revision.status}
					</span>
				</div>
				<p className="text-sm text-gray-600">
					{revision.productVersion
						? `Product ${revision.productVersion} · `
						: ""}
					{staged
						? `Saved ${when(revision.updatedAt)}`
						: revision.releasedAt
							? `Released ${when(revision.releasedAt)}`
							: `Captured ${when(revision.capturedAt)}`}
					{!staged && !revision.wasPublished
						? " · Unpublished source"
						: ""}
				</p>
				<p className="text-xs text-gray-500">
					Author:{" "}
					{data.authorNames?.[
						revision.releasedBy ??
							revision.updatedBy ??
							revision.createdBy ??
							""
					] ?? "Unknown author"}
				</p>
				{revision.supersededAt && (
					<p className="text-xs text-gray-500">
						Replaced {when(revision.supersededAt)}
					</p>
				)}
				{revision.releaseNote && (
					<p className="text-sm whitespace-pre-wrap">
						{revision.releaseNote}
					</p>
				)}
				{data.canEdit &&
					["released", "historical"].includes(revision.status) && (
						<Button
							variant="outline"
							size="sm"
							disabled={busy}
							onClick={() => create(revision.id)}
						>
							Create revision from this version
						</Button>
					)}
			</li>
		);
	}
	const staged = data.revisions.filter((r) =>
			["draft", "ready"].includes(r.status),
		),
		history = data.revisions.filter(
			(r) => !["draft", "ready"].includes(r.status),
		);
	return (
		<main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
			<Link
				className="text-sm text-blue-700 hover:underline"
				href={`/projects/${projectSlug}/docs/${data.current.slug}`}
			>
				← Back to current document
			</Link>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">
					Revisions &amp; history
				</h1>
				{data.canEdit && (
					<Button disabled={busy} onClick={() => create()}>
						Create revision
					</Button>
				)}
			</div>
			{error && (
				<p role="alert" className="text-red-700">
					{error}
				</p>
			)}
			<Card>
				<CardHeader>
					<CardTitle>Current document</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="font-medium">{data.current.title}</p>
					<p className="text-sm text-gray-600">
						{data.current.published ? "Published" : "Unpublished"} ·
						Updated {when(data.current.updatedAt)}
						{data.revisions.find(
							(r) =>
								r.appliedDocumentVersion ===
								data.current.contentVersion,
						)?.productVersion
							? ` · Product ${data.revisions.find((r) => r.appliedDocumentVersion === data.current.contentVersion)?.productVersion}`
							: ""}
					</p>
				</CardContent>
			</Card>
			<section>
				<h2 className="text-lg font-semibold">
					Drafts &amp; ready revisions
				</h2>
				{staged.length ? (
					<ul>{staged.map(row)}</ul>
				) : (
					<p className="py-4 text-sm text-gray-500">
						No staged revisions on this page.
					</p>
				)}
			</section>
			<section>
				<h2 className="text-lg font-semibold">History</h2>
				{history.length ? (
					<ul>{history.map(row)}</ul>
				) : (
					<p className="py-4 text-sm text-gray-500">
						History is captured when a revision is created or
						current content changes.
					</p>
				)}
			</section>
			<div className="flex items-center gap-3">
				<Button
					variant="outline"
					disabled={busy || data.offset === 0}
					onClick={() => page(Math.max(0, data.offset - data.limit))}
				>
					Previous
				</Button>
				<span className="text-sm">
					{data.total ? data.offset + 1 : 0}–
					{Math.min(data.offset + data.limit, data.total)} of{" "}
					{data.total}
				</span>
				<Button
					variant="outline"
					disabled={busy || data.offset + data.limit >= data.total}
					onClick={() => page(data.offset + data.limit)}
				>
					Next
				</Button>
			</div>
		</main>
	);
}
