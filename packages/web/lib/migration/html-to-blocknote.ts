/**
 * Convert WordPress Gutenberg HTML to BlockNote JSON format
 */

import { randomUUID } from 'crypto';

export interface BlockNoteBlock {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: Array<{ type: string; text: string; styles?: Record<string, boolean> }>;
  children?: BlockNoteBlock[];
}

/**
 * Generate a unique ID for blocks
 */
function generateId(): string {
  return randomUUID();
}

/**
 * Convert HTML content to BlockNote blocks
 */
export function convertHTMLToBlockNote(html: string): BlockNoteBlock[] {
  if (!html || !html.trim()) {
    return [{
      id: generateId(),
      type: "paragraph",
      props: {},
      content: [],
      children: [],
    }];
  }

  // Remove WordPress comments
  let cleanHTML = html.replace(/<!--\s*wp:[\s\S]*?-->/g, '');
  cleanHTML = cleanHTML.replace(/<!--\s*\/wp:[\s\S]*?-->/g, '');

  const blocks: BlockNoteBlock[] = [];

  // Parse HTML elements sequentially to maintain order
  const elementRegex = /<(p|h[1-6]|ul|ol|pre|img|figure)[^>]*>[\s\S]*?<\/\1>|<img[^>]*>/gi;
  const matches = cleanHTML.match(elementRegex) || [];

  for (const match of matches) {
    const block = parseElement(match);
    if (block) {
      if (Array.isArray(block)) {
        blocks.push(...block);
      } else {
        blocks.push(block);
      }
    }
  }

  return blocks.length > 0 ? blocks : [{
    id: generateId(),
    type: "paragraph",
    props: {},
    content: [],
    children: [],
  }];
}

/**
 * Parse a single HTML element into BlockNote block(s)
 */
function parseElement(html: string): BlockNoteBlock | BlockNoteBlock[] | null {
  // Paragraph
  if (html.match(/^<p/i)) {
    // Extract content between <p> tags
    const innerContent = html.replace(/^<p[^>]*>|<\/p>$/gi, '');
    const content = parseInlineHTML(innerContent);
    if (content.length === 0 || (content.length === 1 && !content[0].text.trim())) return null;
    return {
      id: generateId(),
      type: "paragraph",
      props: {
        textColor: "default",
        backgroundColor: "default",
        textAlignment: "left"
      },
      content,
      children: [],
    };
  }

  // Heading
  const headingMatch = html.match(/^<h([1-6])/i);
  if (headingMatch) {
    const level = parseInt(headingMatch[1]);
    // Extract content between heading tags
    const innerContent = html.replace(/^<h[1-6][^>]*>|<\/h[1-6]>$/gi, '');
    const content = parseInlineHTML(innerContent);
    if (content.length === 0 || (content.length === 1 && !content[0].text.trim())) return null;
    return {
      id: generateId(),
      type: "heading",
      props: {
        level,
        textColor: "default",
        backgroundColor: "default",
        textAlignment: "left"
      },
      content,
      children: [],
    };
  }

  // Unordered list
  if (html.match(/^<ul/i)) {
    return parseList(html, "bulletListItem");
  }

  // Ordered list
  if (html.match(/^<ol/i)) {
    return parseList(html, "numberedListItem");
  }

  // Image - Convert to BlockNote image block
  if (html.match(/^<img/i) || html.match(/^<figure/i)) {
    const srcMatch = html.match(/src=["']([^"']+)["']/);
    const altMatch = html.match(/alt=["']([^"']*)["']/);
    const titleMatch = html.match(/title=["']([^"']*)["']/);
    if (srcMatch) {
      const imageUrl = srcMatch[1];
      const altText = altMatch?.[1] || "";
      const caption = titleMatch?.[1] || altText;

      return {
        id: generateId(),
        type: "image",
        props: {
          url: imageUrl,
          caption: caption || "",
          textAlignment: "center",
        },
        content: [],
        children: [],
      };
    }
  }

  // Code block
  if (html.match(/^<pre/i)) {
    const content = stripTags(html).trim();
    if (!content) return null;
    return {
      id: generateId(),
      type: "paragraph", // BlockNote doesn't have code block in default schema, use paragraph
      props: {},
      content: [{ type: "text", text: content, styles: {} }],
      children: [],
    };
  }

  return null;
}

/**
 * Parse list into multiple list item blocks
 */
function parseList(html: string, type: "bulletListItem" | "numberedListItem"): BlockNoteBlock[] {
  const items: BlockNoteBlock[] = [];
  const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const content = parseInlineHTML(match[1]);
    if (content.length > 0 && content.some(c => c.text.trim())) {
      items.push({
        id: generateId(),
        type,
        props: {
          textColor: "default",
          backgroundColor: "default",
          textAlignment: "left"
        },
        content,
        children: [],
      });
    }
  }

  return items;
}

/**
 * Parse HTML with inline formatting into BlockNote content array
 */
function parseInlineHTML(html: string): Array<{ type: string; text: string; styles?: Record<string, boolean>; href?: string }> {
  const content: Array<{ type: string; text: string; styles?: Record<string, boolean>; href?: string }> = [];

  // Decode HTML entities
  const decodeEntities = (str: string): string => {
    return str
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'");
  };

  // Track current position and style stack
  let currentText = '';
  let styleStack: Array<{ tag: string; attrs?: Record<string, string> }> = [];
  let i = 0;

  const flushText = () => {
    if (currentText) {
      const styles: Record<string, boolean> = {};
      let href: string | undefined;

      // Build styles from stack
      for (const item of styleStack) {
        if (item.tag === 'strong' || item.tag === 'b') {
          styles.bold = true;
        } else if (item.tag === 'em' || item.tag === 'i') {
          styles.italic = true;
        } else if (item.tag === 'u') {
          styles.underline = true;
        } else if (item.tag === 'strike' || item.tag === 's') {
          styles.strike = true;
        } else if (item.tag === 'code') {
          styles.code = true;
        } else if (item.tag === 'a' && item.attrs?.href) {
          href = item.attrs.href;
        }
      }

      content.push({
        type: 'text',
        text: decodeEntities(currentText),
        styles: styles,
        ...(href && { href }),
      });
      currentText = '';
    }
  };

  while (i < html.length) {
    if (html[i] === '<') {
      // Found a tag
      const tagEnd = html.indexOf('>', i);
      if (tagEnd === -1) break;

      const tagContent = html.substring(i + 1, tagEnd);
      const isClosing = tagContent.startsWith('/');
      const tagName = isClosing
        ? tagContent.substring(1).trim().toLowerCase()
        : tagContent.split(/\s/)[0].toLowerCase();

      // Check if it's a formatting tag we care about
      const formattingTags = ['strong', 'b', 'em', 'i', 'u', 'strike', 's', 'code', 'a'];

      if (formattingTags.includes(tagName)) {
        flushText();

        if (isClosing) {
          // Remove from stack
          for (let j = styleStack.length - 1; j >= 0; j--) {
            if (styleStack[j].tag === tagName) {
              styleStack.splice(j, 1);
              break;
            }
          }
        } else {
          // Add to stack
          const attrs: Record<string, string> = {};
          if (tagName === 'a') {
            const hrefMatch = tagContent.match(/href=["']([^"']+)["']/);
            if (hrefMatch) {
              attrs.href = hrefMatch[1];
            }
          }
          styleStack.push({ tag: tagName, attrs });
        }
      }

      i = tagEnd + 1;
    } else {
      // Regular character
      currentText += html[i];
      i++;
    }
  }

  flushText();

  // If no content was generated, return empty array
  return content.length > 0 ? content : [];
}

/**
 * Strip HTML tags from string (fallback for simple text extraction)
 */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
