# Contributing

Thanks for your interest in contributing! This project is a simple, zero-build Chrome extension. We welcome improvements and new site support.

## Local development

- Load the extension unpacked:
  - Open `chrome://extensions`
  - Enable Developer Mode
  - Click "Load unpacked" and select the `tributary/` directory
- No build step is required. Edit files directly and refresh the extension.

## Code style

- EditorConfig and Prettier are provided (`.editorconfig`, `.prettierrc.json`).
- Use 2-space indentation, LF line endings, and single quotes.
- Keep functions small and focused; prefer pure helpers.

## Adding a new site

Add a new entry to `scripts/site_selectors.js` under the domain key (no `www`). Provide:

- `buttonSelector`: CSS selector(s) for the native like/upvote/bookmark control
- `containerSelector`: CSS selector(s) for the content container
- Optional `hooks` to customize behavior without touching core code:
  - `toggledOnAfterClick(button)`: return true only when click toggles the positive state
  - `getPermalink(button)`: return a canonical permalink for the item
  - `getTitle(button)`: return a good title
  - `getExcerpt(button)`: return an excerpt/summary

Example:

```js
"example.com": {
  buttonSelector: 'button[aria-label="Like"]',
  containerSelector: ['article', 'div.post'],
  hooks: {
    toggledOnAfterClick: async (button) => {
      await new Promise(r => setTimeout(r, 80));
      const el = button.closest('button') || button;
      return el && el.getAttribute('aria-pressed') === 'true';
    },
    getPermalink: (button) => {
      const container = button.closest('article') || document;
      const a = container.querySelector('a[href^="http"]')
      return a ? a.href : '';
    },
    getTitle: () => (document.title || '').slice(0, 200),
    getExcerpt: (button) => {
      const container = button.closest('article') || document;
      return (container.textContent || '').trim().slice(0, 500);
    }
  }
}
```

Also update `manifest.json` if needed:

- Add the domain to `host_permissions`
- Add the match pattern to `content_scripts[0].matches`

Reload the extension, enable the new domain in the Options page, and test.

## Submitting changes

- Open a pull request with a clear description of the change and testing notes.
- If adding a new site, include a link to a reproducible example post.
- Keep PRs small and focused when possible.

## Reporting issues

Please include:

- Browser version and OS
- The site and URL you were on
- Whether Debug Logging (Options page) was enabled and any relevant console logs
