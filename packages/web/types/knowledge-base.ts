/**
 * Knowledge Base Type Definitions
 *
 * These types define the structure of documentation knowledge base files
 * that help the AI assistant write consistent, accurate documentation.
 */

export interface PluginMetadata {
  requires_php?: string | null;
  tested_up_to?: string;
  stable_tag?: string;
  requires_at_least?: string;
  contributors?: string[];
  tags?: string[];
  version?: string;
  description?: string;
  author?: string;
  text_domain?: string;
  domain_path?: string;
  short_description?: string;
}

export interface ProductSummary {
  productName: string;
  oneSentenceSummary: string;
  whatItDoes: string;
  targetUsers: string[];
}

export interface PluginInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  metadata?: PluginMetadata;
  product_summary?: ProductSummary;
}

export interface KnowledgeBaseFeature {
  title: string;
  description: string;
  source: string;
  raw?: Record<string, unknown>;
}

export interface KnowledgeBaseUseCase {
  title: string;
  description: string;
  source: string;
  raw?: Record<string, unknown>;
}

export interface KnowledgeBaseHowTo {
  title: string;
  description: string;
  steps: string[];
  source: string;
  raw?: Record<string, unknown>;
}

export interface ScreenField {
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
  help_text: string;
}

export interface ScreenNavigation {
  trigger: string;
  destination: string;
  confidence: string;
}

export interface KnowledgeBaseScreen {
  id: string;
  title: string;
  purpose: string;
  user_goal: string;
  source_file?: string;
  source_type?: string;
  actions?: {
    primary?: string[];
    secondary?: string[];
  };
  fields?: ScreenField[];
  navigation?: ScreenNavigation[];
}

export interface Knowledge {
  features: KnowledgeBaseFeature[];
  use_cases: KnowledgeBaseUseCase[];
  how_tos: KnowledgeBaseHowTo[];
  components: string[];
  screens: KnowledgeBaseScreen[];
  navigation_flows?: unknown[];
  open_questions?: unknown[];
}

/**
 * Main knowledge base structure
 */
export interface DocumentationKnowledgeBase {
  schema_version?: string;
  generated_at?: string;
  plugin: PluginInfo;
  sources?: Record<string, unknown>;
  knowledge: Knowledge;
  implementation?: Record<string, unknown>;
  provenance?: unknown;
}
