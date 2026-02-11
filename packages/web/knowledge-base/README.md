# Documentation Knowledge Base

This directory contains product-specific knowledge base files that help the AI chat assistant write consistent, accurate documentation.

## What is a Knowledge Base?

A knowledge base file (`{project-slug}.json`) contains:
- **Product Information**: Name, slug, version, description
- **Writing Guidelines**: Tone, style, and formatting preferences
- **Terminology**: Standard terms to use (and avoid)
- **Common Sections**: Templates for standard documentation sections
- **Features**: List of product features with descriptions
- **Code Examples**: Common code snippets users might need
- **FAQs**: Frequently asked questions and answers

## How It Works

1. When creating a new project, you can optionally upload a knowledge base JSON file
2. Or place a `{project-slug}.json` file directly in this directory
3. The AI chat assistant automatically loads it when working on that project
4. The knowledge base guides the AI to:
   - Follow your writing style guidelines
   - Use correct terminology
   - Suggest appropriate section structures
   - Provide accurate feature information
   - Reference common code examples

## Creating a Knowledge Base File

### Quick Start

1. **Copy the example**: Start with `example-product.json` as a template
2. **Follow the schema**: Structure is defined in `documentation-schema.json`
3. **Name it correctly**: Use your project slug (e.g., `my-product.json`)
4. **Upload it**: Either during project creation or add it to this folder manually

### Minimum Required Fields

```json
{
  "product": {
    "name": "Your Product Name",
    "slug": "your-product-slug"
  },
  "writingGuidelines": {
    "tone": "professional and friendly",
    "voicePreference": "active",
    "technicalLevel": "beginner"
  }
}
```

### Full Example Structure

See `example-product.json` for a complete, annotated example with all available fields.

## GitHub Integration (Optional)

You can sync knowledge bases from a GitHub repository:

### Setup

1. Configure GitHub repo in `lib/github-kb-fetcher.ts`:
   ```typescript
   const GITHUB_REPO = "your-org/knowledge-base";
   ```

2. Repository structure:
   ```
   your-org/knowledge-base/
   ├── product-one/
   │   └── documentation.json
   ├── product-two/
   │   └── documentation.json
   └── ...
   ```

3. Sync from GitHub:
   ```bash
   pnpm sync-kb
   ```

### Priority Order

The system loads knowledge bases in this order:
1. **Local files** in this directory (highest priority)
2. **GitHub cached files** (if sync script was run)
3. **Live GitHub fetch** (if enabled and not cached)

Local files always override remote files, allowing you to customize or test changes.

## Best Practices

### Keep It Updated
- Update the knowledge base when features change
- Add new FAQs based on common support questions
- Include code examples for frequently requested scenarios

### Be Specific
- Use concrete examples in terminology definitions
- Provide context for why certain terms should be avoided
- Include realistic code samples, not abstract placeholders

### Start Simple
- Don't try to document everything at once
- Begin with product info and basic writing guidelines
- Add terminology and features as needed
- Expand based on what the AI commonly gets wrong

### Validate Your JSON
- Use `documentation-schema.json` to validate structure
- Test with your AI assistant to verify it helps
- Iterate based on documentation quality improvements

## Schema Reference

The complete JSON schema is available in `documentation-schema.json`. Key sections:

| Section | Required | Purpose |
|---------|----------|---------|
| `product` | ✅ Yes | Basic product information |
| `writingGuidelines` | ✅ Yes | Writing style and tone |
| `terminology` | ❌ No | Product-specific terms |
| `commonSections` | ❌ No | Standard section templates |
| `features` | ❌ No | Feature descriptions |
| `codeExamples` | ❌ No | Reusable code snippets |
| `faqs` | ❌ No | Common questions |

## Troubleshooting

**Knowledge base not loading?**
- Check the filename matches your project slug exactly
- Validate JSON syntax (use a JSON validator)
- Check browser console for error messages

**AI not following guidelines?**
- Be more specific in your guidelines
- Add examples to demonstrate what you want
- Use the terminology section to enforce specific terms

**Need to override GitHub KB?**
- Just create a local file with the same name
- Local files always take priority over remote

## Examples

**For a WordPress Plugin:**
```json
{
  "product": {
    "name": "User Registration Pro",
    "slug": "user-registration-pro",
    "version": "3.2.1"
  },
  "writingGuidelines": {
    "tone": "professional and helpful",
    "technicalLevel": "beginner"
  },
  "terminology": {
    "plugin": {
      "preferredTerm": "plugin",
      "avoid": ["add-on", "extension"],
      "definition": "WordPress plugin functionality"
    }
  }
}
```

**For a JavaScript Library:**
```json
{
  "product": {
    "name": "DataGrid Component",
    "slug": "datagrid"
  },
  "writingGuidelines": {
    "tone": "technical and concise",
    "technicalLevel": "intermediate",
    "formatting": {
      "codeBlockLanguage": "typescript"
    }
  }
}
```

---

**Need help?** Check `example-product.json` for a complete working example.
