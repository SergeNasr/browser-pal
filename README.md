# Browser Pal

Chrome extension providing a command palette for AI-powered browsing commands.

## Features

- Command palette in side panel
- Extensible command system via markdown files
- Text selection support for commands
- Fuzzy search with `/` prefix
- OpenAI integration for AI-powered commands

## Installation

### Building from Source

1. Clone the repository and install dependencies:
```bash
pnpm install
pnpm build
```

2. Load the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `dist` folder from this repository

### API Key Configuration

Browser Pal requires an OpenAI API key to function. After installation:

1. **Get your OpenAI API key:**
   - Visit [OpenAI API Keys](https://platform.openai.com/api-keys)
   - Sign in or create an account
   - Create a new API key

2. **Set the API key in the extension:**
   - Open Chrome DevTools (F12) on any page
   - Go to the Console tab
   - Run the following command:
   ```javascript
   chrome.storage.local.set({openaiApiKey: 'sk-your-api-key-here'})
   ```
   - Replace `sk-your-api-key-here` with your actual API key

3. **Verify it's set:**
   ```javascript
   chrome.storage.local.get(['openaiApiKey'], (result) => console.log(result))
   ```

**Note:** Your API key is stored locally in your browser and never sent anywhere except to OpenAI's API.

## Development

```bash
pnpm dev
```

## Available Commands

### tldr
Summarizes the current page in 3-5 bullet points.

**Usage:** Open side panel → Type `/tldr` → Enter

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

## Usage

## Usage

1. Click the Browser Pal extension icon in your browser toolbar
2. This will open the side panel
3. Use the command palette within the side panel to run AI commands
4. Select text on the web page to use it with commands

## Architecture

```
src/
├── commands/          # Command definitions (markdown)
├── content/           # Content script & UI
├── background/        # Service worker
└── lib/              # Shared utilities
```

Commands are loaded dynamically using Vite's `import.meta.glob` and parsed with gray-matter.
