/**
 * Knowledge Base Type Definitions
 *
 * These types define the structure of documentation knowledge base files
 * that help the AI assistant write consistent, accurate documentation.
 */

export interface ProductInfo {
  name: string;
  slug: string;
  version?: string;
  description?: string;
}

export interface WritingGuidelines {
  tone?: string;
  voicePreference?: "active" | "passive" | "mixed";
  technicalLevel?: "beginner" | "intermediate" | "advanced" | "mixed";
  formatting?: {
    headingStyle?: string;
    codeBlockLanguage?: string;
    useEmojis?: boolean;
  };
}

export interface Terminology {
  preferredTerm: string;
  avoid?: string[];
  definition?: string;
  usage?: string;
}

export interface SectionTemplate {
  required?: boolean;
  template?: string;
  subsections?: string[];
}

export interface CommonSections {
  installation?: SectionTemplate;
  gettingStarted?: SectionTemplate;
  configuration?: SectionTemplate;
  [key: string]: SectionTemplate | undefined;
}

export interface Feature {
  name: string;
  description: string;
  category?: string;
  isPro?: boolean;
  keywords?: string[];
  relatedFeatures?: string[];
}

export interface CodeExample {
  language: string;
  code: string;
  description?: string;
  tags?: string[];
}

export interface FAQ {
  question: string;
  answer: string;
  category?: string;
}

/**
 * Main knowledge base structure
 */
export interface DocumentationKnowledgeBase {
  product: ProductInfo;
  writingGuidelines?: WritingGuidelines;
  terminology?: Record<string, Terminology>;
  commonSections?: CommonSections;
  features?: Record<string, Feature>;
  codeExamples?: Record<string, CodeExample>;
  faqs?: FAQ[];
}
