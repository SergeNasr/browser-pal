# Browser Pal

Chrome extension providing a command palette for AI-powered browsing commands.

## Features

- Command palette activated with `Ctrl+Shift+K`
- Extensible command system via markdown files
- Text selection support for commands
- Fuzzy search with `/` prefix

## Setup

```bash
pnpm install
pnpm build
```

Load the extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

## Development

```bash
pnpm dev
```

## Available Commands

### tldr
Summarizes the current page in 3-5 bullet points.

**Usage:** `Ctrl+Shift+K` → type `/tldr` → Enter

## Creating Commands

Create a markdown file in `src/commands/`:

```markdown
---
name: command-name
description: What this command does
requiresSelection: false
---

Your prompt template here.
Use {{pageContent}} for page content.
Use {{selection}} for selected text.
```

### Template Variables

- `{{pageContent}}` - Current page content
- `{{selection}}` - User-selected text (if any)

### Command Properties

- `name` - Command identifier (used with `/` prefix)
- `description` - Shown in command palette
- `requiresSelection` - If true, command requires text selection

## Architecture

```
src/
├── commands/          # Command definitions (markdown)
├── content/           # Content script & UI
├── background/        # Service worker
└── lib/              # Shared utilities
```

Commands are loaded dynamically using Vite's `import.meta.glob` and parsed with gray-matter.
