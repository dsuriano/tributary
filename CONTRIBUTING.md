# Contributing

Thanks for your interest in contributing! This project uses an esbuild-based workflow and a modular site provider architecture. We welcome improvements and new site support.

## Local development

- Requirements: Node.js 20+ and npm 10+
- Install dependencies:
  - `npm install`
- Start the dev watcher (rebuilds on change):
  - `npm run dev`
- Load Tributary unpacked in Chrome:
  - Open `chrome://extensions`
  - Enable Developer Mode
  - Click "Load unpacked" and select the `dist/chrome/` directory (built output)
- Load Tributary temporarily in Firefox:
  - Open `about:debugging#/runtime/this-firefox`
  - Click "Load Temporary Add-on…" and choose `dist/firefox/manifest.json`
- During development, after changes rebuild, use Refresh/Reload in the respective browser tooling to pick up updates.

## Code style

- EditorConfig and Prettier are provided (`.editorconfig`, `.prettierrc.json`).
- Use 2-space indentation, LF line endings, and single quotes.
- Keep functions small and focused; prefer pure helpers.

## Adding a new site

Add a new provider module under `src/scripts/sites/` and register it in the registry at `src/scripts/sites/index.js`.

1. Create a file, e.g. `src/scripts/sites/example.js`:

```js
// Example provider for example.com
const example = {
  buttonSelector: 'button[aria-label="Like"]',
  containerSelector: ['article', 'div.post'],
  hooks: {
    toggledOnAfterClick: async (button, ctx) => {
      await ctx.utils.wait(80);
      const el = button.closest('button') || button;
      return el && el.getAttribute('aria-pressed') === 'true';
    },
    getPermalink: (button) => {
      const container = button.closest('article') || document;
      const a = container.querySelector('a[href^="http"]');
      return a ? a.href : '';
    },
    getTitle: (_button, ctx) => ctx.utils.normaliseText(document.title, 200),
    getExcerpt: (button, ctx) => {
      const container = button.closest('article') || document;
      return ctx.utils.normaliseText(container.textContent || '', 500);
    },
  },
};

export default example;
```

2. Register it in `src/scripts/sites/index.js`:

```js
const providers = [
  {
    match: ['twitter.com', 'x.com'],
    loader: () => import(chrome.runtime.getURL('scripts/sites/twitter.js')),
  },
  {
    match: ['youtube.com'],
    loader: () => import(chrome.runtime.getURL('scripts/sites/youtube.js')),
  },
  { match: ['reddit.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/reddit.js')) },
  {
    match: ['example.com'],
    loader: () => import(chrome.runtime.getURL('scripts/sites/example.js')),
  },
];
```

Notes:

- Wildcards are supported in `match` via patterns like `*.medium.com`.
- Rebuild (`npm run build`) and reload Tributary. Ensure the new domain appears under Enabled Domains on the Options page.
- Update `manifest.json` if needed:
  - Add the domain to `host_permissions`
  - Add the match pattern to `content_scripts[0].matches`

Reload Tributary, enable the new domain in the Options page, and test.

## Submitting changes

- Open a pull request with a clear description of the change and testing notes.
- If adding a new site, include a link to a reproducible example post.
- Keep PRs small and focused when possible.

## Reporting issues

Please include:

- Browser version and OS
- The site and URL you were on
- Whether Debug Logging (Options page) was enabled and any relevant console logs
