# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser Pal is a Chrome extension that provides AI-powered browsing commands through a side panel interface. Users can execute commands (like `/tldr` to summarize pages), create threaded annotations on highlighted text, and maintain notes organized by browser tab groups.

## Development Commands

### Building and Development
- `pnpm install` - Install dependencies
- `pnpm dev` - Development mode with hot reload
- `pnpm build` - Production build to `dist/` folder

### Extension Installation
After building, load the extension in Chrome:
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` folder

### API Key Setup
The extension requires an OpenAI API key stored in Chrome local storage:
```javascript
chrome.storage.local.set({openaiApiKey: 'sk-your-key-here'})
```

## Code Standards (from .cursor/rules/agent.mdc)

- Always use `pnpm`, never npm or yarn
- Use TypeScript exclusively, never JavaScript
- Do not introduce new dependencies without asking
- Follow existing folder structure
- Write concise comments only when logic is non-obvious

## Architecture

### Core Components

**Service Worker** (`src/background/service-worker.ts`)
- Central message handler for command execution and AI interactions
- Manages OpenAI API calls (uses `gpt-4o-mini` model)
- Handles three message types:
  - `executeCommand`: Runs markdown-defined commands with page content
  - `threadMessage`: Sends messages in highlight threads
  - `summarizeThread`: Generates summaries of conversation threads
- Monitors tab groups and cleans up storage when groups are removed

**Side Panel** (`src/sidepanel/editor.ts` + `editor.html`)
- Rich text editor with contenteditable for notes
- Command execution via `/command` syntax (type `/tldr` and press Enter)
- Text highlighting system with threaded conversations
- Auto-saves content to Chrome storage with 500ms debounce
- Content is scoped to Chrome tab groups (each group has isolated storage)

**Storage System** (`src/lib/storage.ts`)
- Uses Chrome local storage API
- Data structure: `SidepanelContent` with version 2 format
  - `content`: HTML string of editor contents
  - `highlights`: Array of text anchors with optional threads
  - Includes migration from old section-based format (version 1)
- Storage keys are scoped by tab group ID: `sidepanel_data_${groupId}`

**Highlight/Anchor System** (`src/lib/anchor-utils.ts`)
- Uses `dom-anchor-text-quote` library for robust text anchoring
- Anchors store `exact`, `prefix`, and `suffix` text for position-independent highlighting
- Highlights survive content edits by re-applying from stored anchors
- Thread button appears on text selection; clicking creates a highlight with conversation thread

### Command System

Commands are markdown files in `src/commands/` with frontmatter:

```markdown
---
name: command-name
description: Description shown in palette
requiresSelection: false
---

Prompt template here.
Use {{pageContent}} for page content.
Use {{selection}} for selected text.
```

Commands are loaded via Vite's `import.meta.glob` and parsed with custom frontmatter parser in `command-loader.ts`. The service worker processes templates, replaces variables, and sends prompts to OpenAI.

### Build System

- **Vite** with `@crxjs/vite-plugin` for Chrome extension bundling
- Manifest V3 format
- TypeScript compilation via `tsconfig.json`
- Output to `dist/` directory

### Key Data Flow

1. User types `/command` in side panel editor → detected on Enter keypress
2. Editor sends `executeCommand` message to service worker
3. Service worker loads command template, injects page content, calls OpenAI
4. Response inserted as markdown at cursor position
5. Content auto-saved to Chrome storage (scoped by tab group)

For highlights:
1. User selects text → thread button appears
2. Click thread button → creates highlight with text anchor
3. Click highlight → opens thread panel
4. Messages sent via `threadMessage` to service worker
5. AI responses added to thread, saved with highlight data

## Important Implementation Notes

### Storage and Tab Groups
- All sidepanel content is tied to Chrome tab group IDs
- When a tab group is deleted, associated storage is automatically cleaned up
- Sidepanel automatically closes if current tab leaves its group

### Highlight Persistence
- Highlights use text quote anchors (not DOM positions) to survive content edits
- After any editor input, highlights are removed and re-applied from stored anchors
- This prevents stale DOM references and maintains highlight accuracy

### Security
- All markdown rendered through `marked` library
- HTML sanitized with `DOMPurify` before insertion
- OpenAI API key stored in Chrome local storage (never transmitted except to OpenAI)
