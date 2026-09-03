export type ProjectRole = "viewer" | "editor" | "admin" | "owner";

export interface ActorContext {
	userId: string;
	scopes?: string[];
	transport: "stdio" | "http" | "web";
}

export interface SeoData {
	metaTitle?: string;
	metaDescription?: string;
	schemaType?: "Article" | "TechArticle" | "HowTo" | "FAQPage";
	canonicalUrl?: string;
	robots?: {
		index?: boolean;
		follow?: boolean;
		maxSnippet?: number;
		maxVideoPreview?: number;
		maxImagePreview?: "none" | "standard" | "large";
	};
	ogTitle?: string;
	ogDescription?: string;
	ogImage?: string;
	ogImageAlt?: string;
	twitterCard?: "summary" | "summary_large_image";
	sitemap?: {
		include?: boolean;
		priority?: number;
		changeFrequency?:
			| "always"
			| "hourly"
			| "daily"
			| "weekly"
			| "monthly"
			| "yearly"
			| "never";
	};
	focusKeyword?: string;
}

export interface Block {
	id: string;
	type: string;
	props?: unknown;
	content?: unknown[];
	children?: Block[];
}
export interface NavRoute {
	id?: string;
	title: string;
	path?: string;
	slug?: string;
	children?: NavRoute[];
	orderIndex?: number;
}
export interface Navigation {
	id?: string;
	title: string;
	version: string;
	routes: NavRoute[];
}
export interface Placement {
	position?: number;
	beforeDocumentId?: string;
	afterDocumentId?: string;
}

export class DomainError extends Error {
	constructor(
		public code:
			| "FORBIDDEN"
			| "NOT_FOUND"
			| "CONFLICT"
			| "STALE_VERSION"
			| "INVALID_INPUT"
			| "CONFIRMATION_REQUIRED",
		message: string,
		public details?: unknown,
	) {
		super(message);
	}
}
