# Browser Pal

Chrome extension with AI-powered commands and threaded annotations in a side panel. Notes and highlights are scoped to Chrome tab groups.

## Quick Start

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Build:**
   ```bash
   pnpm build
   ```

3. **Load extension:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select `dist` folder

4. **Set API key:**
   Open DevTools console and run:
   ```javascript
   chrome.storage.local.set({openaiApiKey: 'sk-your-key-here'})
   ```

## Usage

- **Commands:** Type `/tldr` (or any command) in the side panel and press Enter
- **Highlights:** Select text → click thread button → create threaded conversations
- **Notes:** Auto-saved to Chrome storage, scoped by tab group

## Development

```bash
pnpm dev  # Hot reload development mode
```

## Creating Commands

Add markdown files to `src/commands/`:

```markdown
---
name: command-name
description: Description
requiresSelection: false
---

Prompt template.
Use {{pageContent}} and {{selection}}.
```

## Architecture

- **Service Worker** (`src/background/service-worker.ts`): Handles commands, threads, OpenAI API
- **Side Panel** (`src/sidepanel/editor.ts`): Rich text editor with highlights and commands
- **Storage** (`src/lib/storage.ts`): Tab group-scoped content and highlights
- **Highlights** (`src/lib/anchor-utils.ts`): Text quote anchors for persistent highlighting
