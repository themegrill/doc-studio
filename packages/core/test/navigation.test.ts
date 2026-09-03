import assert from "node:assert/strict";
import test from "node:test";
import {
	assertActorScope,
	DomainError,
	findSection,
	insertDocument,
	normalizeNavigation,
	removeDocument,
	replaceRedirects,
	safeSlugSegment,
	sectionPrefix,
	sectionStateFingerprint,
	validateBlocks,
} from "../src/index.js";
import type { Block } from "../src/index.js";

test("inserts documents at exact beginning, middle, and end", () => {
	const nav = normalizeNavigation({
		title: "Docs",
		version: "1",
		routes: [
			{
				title: "A",
				slug: "a",
				children: [
					{ id: "1", title: "One" },
					{ id: "3", title: "Three" },
				],
			},
		],
	});
	const section = nav.routes[0];
	assert.equal(
		insertDocument(
			nav,
			section,
			{ id: "0", title: "Zero" },
			{ position: 0 },
		),
		0,
	);
	assert.equal(
		insertDocument(
			nav,
			section,
			{ id: "2", title: "Two" },
			{ beforeDocumentId: "3" },
		),
		2,
	);
	assert.equal(insertDocument(nav, section, { id: "4", title: "Four" }), 4);
	assert.deepEqual(
		section.children?.map((c) => c.id),
		["0", "1", "2", "3", "4"],
	);
	assert.deepEqual(
		section.children?.map((c) => c.orderIndex),
		[0, 1, 2, 3, 4],
	);
});

test("removes by stable id and collapses redirect chains", () => {
	const nav = normalizeNavigation({
		routes: [
			{ title: "A", children: [{ id: "x", title: "X", slug: "a/x" }] },
		],
	});
	removeDocument(nav, "x");
	assert.deepEqual(nav.routes[0].children, []);
	assert.deepEqual(
		replaceRedirects(
			[{ from: "/old", to: "/a/x" }],
			[{ oldSlug: "a/x", newSlug: "b/x" }],
		),
		[
			{ from: "/old", to: "/b/x" },
			{ from: "/a/x", to: "/b/x" },
		],
	);
});

test("scope policy fails closed except trusted in-process web actors", () => {
	assert.throws(
		() =>
			assertActorScope(
				{ userId: "u", transport: "stdio", scopes: [] },
				"docs:read",
			),
		DomainError,
	);
	assert.throws(
		() =>
			assertActorScope({ userId: "u", transport: "stdio" }, "docs:read"),
		DomainError,
	);
	assert.doesNotThrow(() =>
		assertActorScope({ userId: "u", transport: "web" }, "docs:read"),
	);
});

test("canonical slugs reject traversal, whitespace, case and repeated separators", () => {
	assert.equal(safeSlugSegment("safe-topic-2"), "safe-topic-2");
	for (const unsafe of [
		"../topic",
		"Bad-Slug",
		"bad slug",
		"bad--slug",
		"topic/child",
	])
		assert.throws(() => safeSlugSegment(unsafe));
});

test("category sections derive authority from child ids and slug prefixes", () => {
	const nav = normalizeNavigation({
		routes: [
			{
				id: "category",
				title: "Category",
				children: [
					{ id: "doc", title: "Doc", slug: "actual-prefix/topic" },
				],
			},
		],
	});
	const section = findSection(nav, "actual-prefix");
	assert.equal(section?.id, "category");
	assert.equal(sectionPrefix(section!), "actual-prefix");
});

test("confirmation state changes with navigation or affected document set", () => {
	const nav = { routes: [{ id: "s", children: [{ id: "a" }] }] };
	const first = sectionStateFingerprint(nav, [{ id: "a", slug: "s/a" }]);
	assert.notEqual(
		first,
		sectionStateFingerprint(
			{ routes: [{ id: "s", children: [{ id: "a" }, { id: "b" }] }] },
			[{ id: "a", slug: "s/a" }],
		),
	);
	assert.notEqual(
		first,
		sectionStateFingerprint(nav, [
			{ id: "a", slug: "s/a" },
			{ id: "b", slug: "s/b" },
		]),
	);
});

test("BlockNote input enforces count, nesting and serialized-size bounds", () => {
	assert.doesNotThrow(() =>
		validateBlocks([
			{
				id: "a",
				type: "paragraph",
				content: [{ type: "text", text: "ok" }],
			},
		]),
	);
	assert.throws(() =>
		validateBlocks(
			Array.from({ length: 501 }, (_, i) => ({
				id: String(i),
				type: "paragraph",
			})),
		),
	);
	let nested: Block = { id: "leaf", type: "paragraph" };
	for (let i = 0; i < 11; i++)
		nested = { id: String(i), type: "paragraph", children: [nested] };
	assert.throws(() => validateBlocks([nested]));
});
