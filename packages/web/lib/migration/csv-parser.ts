export interface BetterDocsRow {
  type: string;
  docsId: string;
  docsTitle: string;
  docsContent: string;
  docsExcerpt: string;
  docsSlug: string;
  docsStatus: string;
  knowledgeBases: string;
  docCategories: string;
  docsMenuOrder: string;
}

export interface CategoryDefinition {
  id: string;
  name: string;
  parent: string | null;
  taxonomy: string;
  order: number;
}

export interface ParsedDocument {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  status: string;
  knowledgeBase: string;
  categoryIds: string[]; // Category IDs
  order: number;
}

export interface ParseResult {
  documents: ParsedDocument[];
  categories: Record<string, CategoryDefinition>;
}

/**
 * Parse BetterDocs CSV export file
 */
export async function parseBetterDocsCSV(csvText: string): Promise<ParseResult> {
  const lines = csvText.split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file is empty or invalid');
  }

  // Parse header
  const header = parseCSVLine(lines[0]);
  const columnMap = createColumnMap(header);

  // Parse rows
  const documents: ParsedDocument[] = [];
  const categories: Record<string, CategoryDefinition> = {};
  let currentLine = '';
  let inQuotes = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Handle multi-line quoted fields
    currentLine += (currentLine ? '\n' : '') + line;

    // Count quotes to determine if we're inside a quoted field
    const quoteCount = (currentLine.match(/"/g) || []).length;
    inQuotes = quoteCount % 2 !== 0;

    if (inQuotes) {
      continue; // Continue reading next line
    }

    // Parse the complete line
    if (currentLine.trim()) {
      try {
        const row = parseCSVLine(currentLine);
        const type = row[columnMap.type]?.toLowerCase();

        if (type === 'docs') {
          const doc = parseDocumentRow(row, columnMap);
          if (doc) {
            documents.push(doc);
          }
        } else if (type === 'term') {
          const category = parseCategoryRow(row, columnMap);
          if (category) {
            categories[category.id] = category;
          }
        }
      } catch (error) {
        console.error('Error parsing CSV line:', error);
      }
    }

    currentLine = '';
  }

  return { documents, categories };
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Create column index map from header
 */
function createColumnMap(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};

  header.forEach((col, index) => {
    const normalized = col.toLowerCase().replace(/["\s]/g, '');
    map[normalized] = index;
  });

  return {
    type: map['type'] ?? 0,
    docsId: map['docsid'] ?? 1,
    docsTitle: map['docstitle'] ?? 5,
    docsContent: map['docscontent'] ?? 6,
    docsExcerpt: map['docsexcerpt'] ?? 7,
    docsSlug: map['docsslug'] ?? 10,
    docsStatus: map['docsstatus'] ?? 8,
    knowledgeBases: map['knowledgebases'] ?? 19,
    docCategories: map['doccategories'] ?? 17,
    docsMenuOrder: map['docsmenuorder'] ?? 14,
    // Term/Category columns
    termId: map['termid'] ?? 29,
    termName: map['termname'] ?? 30,
    termParent: map['termparent'] ?? 34,
    taxonomy: map['taxonomy'] ?? 28,
    docCategoryOrder: map['doccategoryorder'] ?? 37,
  };
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Parse a document row into structured data
 */
function parseDocumentRow(row: string[], columnMap: Record<string, number>): ParsedDocument | null {
  try {
    const title = row[columnMap.docsTitle]?.trim();
    const slug = row[columnMap.docsSlug]?.trim();

    if (!title || !slug) {
      return null;
    }

    // Parse category IDs (can be comma-separated)
    const categoriesStr = row[columnMap.docCategories]?.trim() || '';
    const categoryIds = categoriesStr
      ? categoriesStr.split(',').map(c => c.trim()).filter(Boolean)
      : [];

    return {
      id: row[columnMap.docsId]?.trim() || '',
      title: decodeHTMLEntities(title),
      content: row[columnMap.docsContent] || '',
      excerpt: decodeHTMLEntities(row[columnMap.docsExcerpt]?.trim() || ''),
      slug: sanitizeSlug(slug),
      status: row[columnMap.docsStatus]?.trim() || 'publish',
      knowledgeBase: row[columnMap.knowledgeBases]?.trim() || 'Default',
      categoryIds,
      order: parseInt(row[columnMap.docsMenuOrder] || '0', 10),
    };
  } catch (error) {
    console.error('Error parsing document row:', error);
    return null;
  }
}

/**
 * Parse a category/term row into structured data
 */
function parseCategoryRow(row: string[], columnMap: Record<string, number>): CategoryDefinition | null {
  try {
    const termId = row[columnMap.termId]?.trim();
    const termName = row[columnMap.termName]?.trim();
    const taxonomy = row[columnMap.taxonomy]?.trim();
    const termParent = row[columnMap.termParent]?.trim();
    const categoryOrder = row[columnMap.docCategoryOrder]?.trim();

    if (!termId || !termName) {
      return null;
    }

    // Only process doc_category taxonomy
    if (taxonomy !== 'doc_category') {
      return null;
    }

    return {
      id: termId,
      name: decodeHTMLEntities(termName),
      parent: termParent && termParent !== '0' ? termParent : null,
      taxonomy,
      order: parseInt(categoryOrder || '999', 10),
    };
  } catch (error) {
    console.error('Error parsing category row:', error);
    return null;
  }
}

/**
 * Sanitize slug to be URL-safe
 */
function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get statistics from parsed data
 */
export function getDocumentStats(
  documents: ParsedDocument[],
  categories: Record<string, CategoryDefinition>
): {
  totalDocs: number;
  knowledgeBases: string[];
  categories: string[];
} {
  const knowledgeBasesSet = new Set<string>();
  const categoryNamesSet = new Set<string>();

  documents.forEach((doc) => {
    if (doc.knowledgeBase) {
      knowledgeBasesSet.add(doc.knowledgeBase);
    }
    doc.categoryIds.forEach((catId) => {
      const category = categories[catId];
      if (category) {
        categoryNamesSet.add(category.name);
      }
    });
  });

  return {
    totalDocs: documents.length,
    knowledgeBases: Array.from(knowledgeBasesSet),
    categories: Array.from(categoryNamesSet),
  };
}
