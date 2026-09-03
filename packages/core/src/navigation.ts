import type { NavRoute, Navigation, Placement } from "./types.js";

export const cleanSlug = (value: string) =>
	value.trim().replace(/^\/+|\/+$/g, "");
const slugSegmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function safeSlugSegment(value: string) {
	const slug = cleanSlug(value);
	if (!slugSegmentPattern.test(slug))
		throw new Error(
			"Slug must contain lowercase letters, numbers, and single hyphens only",
		);
	return slug;
}
export const routeSlug = (route: NavRoute) =>
	cleanSlug(route.slug ?? route.path?.replace(/^\/docs\//, "") ?? "");
export const sectionSlug = (route: NavRoute) => routeSlug(route).split("/")[0];

export function sectionPrefix(route: NavRoute) {
	const direct = sectionSlug(route);
	if (direct) return safeSlugSegment(direct);
	const prefixes = new Set(
		(route.children ?? [])
			.map(routeSlug)
			.filter(Boolean)
			.map((slug) => slug.split("/")[0]),
	);
	if (prefixes.size !== 1)
		throw new Error("Section has no unambiguous document slug prefix");
	return safeSlugSegment([...prefixes][0]);
}

export function normalizeNavigation(value: unknown): Navigation {
	let parsed = value;
	if (typeof parsed === "string") parsed = JSON.parse(parsed);
	if (!parsed || typeof parsed !== "object")
		return { title: "Documentation", version: "1.0", routes: [] };
	const nav = parsed as Partial<Navigation>;
	return {
		title: nav.title ?? "Documentation",
		version: nav.version ?? "1.0",
		routes: Array.isArray(nav.routes) ? nav.routes : [],
	};
}

export function findSection(nav: Navigation, slugOrId: string) {
	const ref = cleanSlug(slugOrId);
	return nav.routes.find(
		(route) =>
			route.id === slugOrId ||
			sectionSlug(route) === ref ||
			(route.children ?? []).some(
				(child) => routeSlug(child).split("/")[0] === ref,
			),
	);
}

export function sectionDocumentRefs(route: NavRoute) {
	return (route.children ?? [])
		.map((child) => ({ id: child.id, slug: routeSlug(child) }))
		.filter((ref) => ref.id || ref.slug);
}

export function removeDocument(
	nav: Navigation,
	documentId: string,
	slug?: string,
) {
	const needle = slug ? cleanSlug(slug) : undefined;
	for (const route of nav.routes) {
		route.children = (route.children ?? []).filter(
			(child) =>
				child.id !== documentId &&
				(!needle || routeSlug(child) !== needle),
		);
	}
}

export function insertDocument(
	nav: Navigation,
	section: NavRoute,
	node: NavRoute,
	placement: Placement = {},
) {
	const children = section.children ?? (section.children = []);
	let index = children.length;
	const modes = [
		placement.position !== undefined,
		!!placement.beforeDocumentId,
		!!placement.afterDocumentId,
	].filter(Boolean).length;
	if (modes > 1) throw new Error("Provide only one placement selector");
	if (placement.position !== undefined)
		index = Math.max(0, Math.min(placement.position, children.length));
	if (placement.beforeDocumentId) {
		index = children.findIndex((c) => c.id === placement.beforeDocumentId);
		if (index < 0) throw new Error("beforeDocumentId is not a sibling");
	}
	if (placement.afterDocumentId) {
		index = children.findIndex((c) => c.id === placement.afterDocumentId);
		if (index < 0) throw new Error("afterDocumentId is not a sibling");
		index += 1;
	}
	children.splice(index, 0, node);
	children.forEach((child, i) => {
		child.orderIndex = i;
	});
	return index;
}

export function replaceRedirects(
	existing: unknown,
	changes: Array<{ oldSlug: string; newSlug: string }>,
) {
	const redirects = Array.isArray(existing) ? existing : [];
	const byFrom = new Map<string, string>();
	for (const item of redirects)
		if (
			item &&
			typeof item.from === "string" &&
			typeof item.to === "string"
		)
			byFrom.set(item.from, item.to);
	for (const change of changes) {
		const from = `/${cleanSlug(change.oldSlug)}`;
		const to = `/${cleanSlug(change.newSlug)}`;
		for (const [key, value] of byFrom)
			if (value === from) byFrom.set(key, to);
		byFrom.set(from, to);
	}
	return [...byFrom]
		.filter(([from, to]) => from !== to)
		.map(([from, to]) => ({ from, to }));
}
