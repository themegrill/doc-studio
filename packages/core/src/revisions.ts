import type postgres from "postgres";
import { DomainError, type Block, type SeoData } from "./types.js";
export type RevisionStatus =
	| "draft"
	| "ready"
	| "released"
	| "historical"
	| "discarded";
export interface RevisionCreate {
	sourceRevisionId?: string;
	productVersion?: string | null;
	releaseNote?: string | null;
}
export interface RevisionVersionInput {
	expectedEditVersion: string;
}
export interface RevisionPatch extends RevisionVersionInput {
	title?: string;
	description?: string | null;
	blocks?: Block[];
	seo?: SeoData;
	productVersion?: string | null;
	releaseNote?: string | null;
}
export interface RevisionPublishInput extends RevisionVersionInput {
	expectedDocumentVersion: string;
}
export interface RevisionSummary {
	id: string;
	documentId: string;
	revisionNumber: string;
	title: string;
	description: string | null;
	status: RevisionStatus;
	productVersion: string | null;
	releaseNote: string | null;
	sourceRevisionId: string | null;
	baseDocumentVersion: string;
	editVersion: string;
	appliedDocumentVersion: string | null;
	wasPublished: boolean;
	capturedSlug: string;
	createdBy: string | null;
	updatedBy: string | null;
	releasedBy: string | null;
	createdAt: string;
	updatedAt: string;
	releasedAt: string | null;
	supersededAt: string | null;
	capturedAt: string | null;
}
export interface Revision extends RevisionSummary {
	blocks: Block[];
	seo: SeoData;
}
export interface RevisionDetail extends Revision {
	currentDocumentVersion: string;
	currentSlug: string;
	currentPublished: boolean;
	canEdit: boolean;
	canPublish: boolean;
}
export interface RevisionCurrent {
	id: string;
	slug: string;
	title: string;
	published: boolean;
	contentVersion: string;
	updatedAt: string;
}
export interface RevisionList {
	current: RevisionCurrent;
	revisions: RevisionSummary[];
	total: number;
	limit: number;
	offset: number;
	canEdit: boolean;
	canPublish: boolean;
}
export interface RevisionPublishResult {
	revision: Revision;
	currentDocument: {
		id: string;
		slug: string;
		contentVersion: string;
	};
	alreadyReleased: boolean;
	isCurrent: boolean;
}
export type RevisionDb =
	| postgres.Sql<Record<string, unknown>>
	| postgres.TransactionSql<Record<string, unknown>>;
export type RevisionRow = Record<string, any>;
const date = (v: unknown): string | null =>
	v == null ? null : new Date(v as string).toISOString();
export function revisionDto(row: RevisionRow): Revision {
	return {
		id: row.id,
		documentId: row.document_id,
		revisionNumber: String(row.revision_number),
		title: row.title,
		description: row.description,
		status: row.status,
		productVersion: row.product_version,
		releaseNote: row.release_note,
		sourceRevisionId: row.source_revision_id,
		baseDocumentVersion: String(row.base_document_version),
		editVersion: String(row.edit_version),
		appliedDocumentVersion:
			row.applied_document_version == null
				? null
				: String(row.applied_document_version),
		wasPublished: row.was_published,
		capturedSlug: row.captured_slug,
		createdBy: row.created_by,
		updatedBy: row.updated_by,
		releasedBy: row.released_by,
		createdAt: date(row.created_at)!,
		updatedAt: date(row.updated_at)!,
		releasedAt: date(row.released_at),
		supersededAt: date(row.superseded_at),
		capturedAt: date(row.captured_at),
		blocks: row.blocks,
		seo: row.seo,
	};
}
export function revisionSummary(row: RevisionRow): RevisionSummary {
	const { blocks: _blocks, seo: _seo, ...summary } = revisionDto(row);
	return summary;
}
export function currentDto(row: RevisionRow): RevisionCurrent {
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		published: row.published === true,
		contentVersion: String(row.content_version),
		updatedAt: date(row.updated_at)!,
	};
}
export function revisionUuid(value: unknown, name: string) {
	if (
		typeof value !== "string" ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			value,
		)
	)
		throw new DomainError("INVALID_INPUT", `${name} must be a UUID`);
}
export function versionToken(
	value: unknown,
	name: string,
): asserts value is string {
	if (
		typeof value !== "string" ||
		!/^[1-9]\d{0,18}$/.test(value) ||
		BigInt(value) > BigInt("9223372036854775807")
	)
		throw new DomainError(
			"INVALID_INPUT",
			`${name} must be a positive decimal version string`,
		);
}
export function checkEdit(row: RevisionRow, expected: unknown) {
	versionToken(expected, "expectedEditVersion");
	if (String(row.edit_version) !== expected)
		throw new DomainError("STALE_VERSION", "Revision has changed", {
			editVersion: String(row.edit_version),
		});
	if (row.status !== "draft" && row.status !== "ready")
		throw new DomainError(
			"CONFLICT",
			"Only draft or ready revisions can be changed",
		);
}
export function boundedText(
	value: unknown,
	name: string,
	max: number,
	nullable = false,
	nonempty = false,
) {
	if (value === undefined || (nullable && value === null)) return;
	if (
		typeof value !== "string" ||
		value.length > max ||
		(nonempty && !value.trim())
	)
		throw new DomainError(
			"INVALID_INPUT",
			`${name} is invalid (maximum ${max} characters)`,
		);
}
export function validateRevisionInput(input: RevisionCreate | RevisionPatch) {
	boundedText(input.productVersion, "productVersion", 200, true);
	boundedText(input.releaseNote, "releaseNote", 10000, true);
	const p = input as RevisionPatch;
	boundedText(p.title, "title", 500, false, true);
	boundedText(p.description, "description", 10000, true);
	if (p.seo !== undefined) validateRevisionSeo(p.seo);
}
export function validateRevisionSeo(seo: unknown) {
	if (
		!seo ||
		typeof seo !== "object" ||
		Array.isArray(seo) ||
		Buffer.byteLength(JSON.stringify(seo)) > 100000
	)
		throw new DomainError("INVALID_INPUT", "Invalid SEO object");
	const obj = seo as Record<string, unknown>;
	const strings = [
		"metaTitle",
		"metaDescription",
		"canonicalUrl",
		"ogTitle",
		"ogDescription",
		"ogImage",
		"ogImageAlt",
		"focusKeyword",
	];
	for (const key of strings) boundedText(obj[key], `seo.${key}`, 10000);
	for (const [key, values] of Object.entries({
		schemaType: ["Article", "TechArticle", "HowTo", "FAQPage"],
		twitterCard: ["summary", "summary_large_image"],
	})) {
		if (obj[key] !== undefined && !values.includes(obj[key] as string))
			throw new DomainError("INVALID_INPUT", `Invalid seo.${key}`);
	}
	for (const key of ["robots", "sitemap"]) {
		const value = obj[key];
		if (value === undefined) continue;
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new DomainError("INVALID_INPUT", `Invalid seo.${key}`);
		const nested = value as Record<string, unknown>;
		const allowed =
			key === "robots"
				? [
						"index",
						"follow",
						"maxSnippet",
						"maxVideoPreview",
						"maxImagePreview",
					]
				: ["include", "priority", "changeFrequency"];
		if (Object.keys(nested).some((k) => !allowed.includes(k)))
			throw new DomainError("INVALID_INPUT", `Unknown seo.${key} field`);
		for (const k of key === "robots" ? ["index", "follow"] : ["include"])
			if (nested[k] !== undefined && typeof nested[k] !== "boolean")
				throw new DomainError(
					"INVALID_INPUT",
					`Invalid seo.${key}.${k}`,
				);
		for (const k of ["maxSnippet", "maxVideoPreview"])
			if (
				nested[k] !== undefined &&
				(typeof nested[k] !== "number" ||
					!Number.isInteger(nested[k]) ||
					Number(nested[k]) < -1)
			)
				throw new DomainError(
					"INVALID_INPUT",
					`Invalid seo.${key}.${k}`,
				);
		if (
			nested.priority !== undefined &&
			(typeof nested.priority !== "number" ||
				!Number.isFinite(nested.priority) ||
				nested.priority < 0 ||
				nested.priority > 1)
		)
			throw new DomainError("INVALID_INPUT", "Invalid sitemap priority");
		if (
			nested.maxImagePreview !== undefined &&
			!["none", "standard", "large"].includes(
				nested.maxImagePreview as string,
			)
		)
			throw new DomainError("INVALID_INPUT", "Invalid maxImagePreview");
		if (
			nested.changeFrequency !== undefined &&
			![
				"always",
				"hourly",
				"daily",
				"weekly",
				"monthly",
				"yearly",
				"never",
			].includes(nested.changeFrequency as string)
		)
			throw new DomainError("INVALID_INPUT", "Invalid changeFrequency");
	}
	const allowed = [
		...strings,
		"schemaType",
		"twitterCard",
		"robots",
		"sitemap",
	];
	if (Object.keys(obj).some((k) => !allowed.includes(k)))
		throw new DomainError("INVALID_INPUT", "Unknown SEO field");
}
// Parent document must already be locked. Never call these helpers outside its transaction.
export async function nextRevisionNumber(db: RevisionDb, documentId: unknown) {
	const [row] =
		await db`SELECT COALESCE(MAX(revision_number), 0) + 1 AS number FROM document_revisions WHERE document_id=${documentId}`;
	return String(row.number);
}
export async function captureCurrent(
	db: RevisionDb,
	doc: RevisionRow,
	actorId: string,
	released = false,
) {
	const [existing] =
		await db`SELECT * FROM document_revisions WHERE document_id=${doc.id} AND applied_document_version=${doc.content_version} ORDER BY revision_number DESC LIMIT 1`;
	if (existing) return existing;
	const number = await nextRevisionNumber(db, doc.id);
	const effectivePublished = doc.published === true && !doc.deleted_at;
	const [snapshot] =
		await db`INSERT INTO document_revisions (document_id, revision_number, title, description, blocks, seo, status, base_document_version, applied_document_version, was_published, captured_slug, created_by, updated_by, released_by, released_at, captured_at)
 VALUES (${doc.id},${number},${doc.title},${doc.description},${db.json(doc.blocks ?? [])},${db.json(doc.seo ?? {})},${released && effectivePublished ? "released" : "historical"},${doc.content_version},${doc.content_version},${effectivePublished},${doc.slug},${actorId},${actorId},${released && effectivePublished ? actorId : null},${released && effectivePublished ? new Date() : null},NOW()) RETURNING *`;
	return snapshot;
}
export async function closeLiveIntervals(db: RevisionDb, documentId: unknown) {
	await db`UPDATE document_revisions SET superseded_at=NOW() WHERE document_id=${documentId} AND applied_document_version IS NOT NULL AND was_published=true AND superseded_at IS NULL`;
}
export async function recordCurrentChange(
	db: RevisionDb,
	before: RevisionRow,
	after: RevisionRow,
	actorId: string,
) {
	if (String(before.content_version) === String(after.content_version))
		return;
	await captureCurrent(db, before, actorId);
	await closeLiveIntervals(db, before.id);
	await captureCurrent(db, after, actorId, true);
}
