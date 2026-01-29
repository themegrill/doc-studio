# Documentation Builder

AI-powered documentation builder with rich text editing capabilities.

## Features

- 📝 Rich text editing with BlockNote
- 🗂️ JSON-based content storage
- 🎨 Clean, Notion-like UI
- 🔍 Easy navigation
- 🤖 AI-powered assistance (coming soon)

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Editor:** BlockNote
- **Styling:** Tailwind CSS + shadcn/ui
- **Language:** TypeScript

## Getting Started

### Prerequisites

- Node.js 18 or higher
- pnpm package manager
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/themegrill/docs-builder.git
cd docs-builder

# Initialize submodule
git submodule update --init --recursive

# Install dependencies
cd packages/web
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure
```
docs-builder/
├── content/              # Git submodule (documentation content)
│   └── docs/
│       ├── meta.json    # Navigation structure
│       └── *.json       # Documentation pages
└── packages/
    └── web/             # Next.js application
        ├── app/         # App router pages
        ├── components/  # React components
        └── lib/         # Utilities
```

## Content Management

### Adding a New Page

1. Create a new JSON file in `content/docs/your-section/`
2. Update `content/docs/meta.json` to include the new page in navigation
3. Commit changes to the content repository

### Page JSON Structure
```json
{
  "meta": {
    "title": "Page Title",
    "description": "Page description",
    "slug": "section/page-name",
    "createdAt": "2024-01-29T00:00:00Z",
    "updatedAt": "2024-01-29T00:00:00Z",
    "order": 1
  },
  "blocks": [
    // BlockNote block structure
  ]
}
```

## Development

### Running Locally
```bash
cd packages/web
pnpm dev
```

### Building for Production
```bash
cd packages/web
pnpm build
pnpm start
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Your License Here]

## Team

Maintained by [ThemeGrill](https://github.com/themegrill)
