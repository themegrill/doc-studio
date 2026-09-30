"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useEditing } from "@/contexts/EditingContext";
import type { RevisionList } from "@doc-studio/core";
export default function DocumentRevisionActions({
	projectSlug,
	documentId,
}: {
	projectSlug: string;
	documentId: string;
}) {
	const [access, setAccess] = useState<RevisionList | null>(null),
		[error, setError] = useState(""),
		[busy, setBusy] = useState(false);
	const { isDirty } = useEditing();
	const router = useRouter();
	const api = `/api/projects/${encodeURIComponent(projectSlug)}/documents/${documentId}/revisions`;
	const base = `/projects/${encodeURIComponent(projectSlug)}/revisions/${documentId}`;
	useEffect(() => {
		let active = true;
		fetch(api, { cache: "no-store" })
			.then(async (r) => {
				if (r.ok && active) setAccess(await r.json());
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [api]);
	if (!access) return null;
	async function create() {
		if (
			isDirty &&
			!window.confirm(
				"Create a revision from saved current content? Your unsaved edits are not included.",
			)
		)
			return;
		setBusy(true);
		setError("");
		try {
			const r = await fetch(api, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			const data = await r.json();
			if (!r.ok) throw new Error(data.error);
			router.push(`${base}/${data.id}`);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Could not create revision",
			);
			setBusy(false);
		}
	}
	return (
		<div className="mb-6 flex flex-wrap items-center gap-3 border-b pb-4">
			{access.canEdit && (
				<Button
					variant="outline"
					size="sm"
					disabled={busy || isDirty}
					onClick={create}
				>
					Create revision
				</Button>
			)}
			<Link className="text-sm text-blue-700 hover:underline" href={base}>
				Revisions &amp; history
			</Link>
			{isDirty && (
				<span className="text-xs text-gray-500">
					Save or cancel current edits before creating a revision.
				</span>
			)}
			{error && (
				<p role="alert" className="text-sm text-red-700">
					{error}
				</p>
			)}
		</div>
	);
}
