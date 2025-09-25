# Social Media to Raindrop.io Chrome Extension

Save interesting content from your social feeds straight into your Raindrop.io collections. Once configured, this extension listens for clicks on the native **Like**, **Bookmark** or **Upvote** buttons on supported websites and automatically creates a bookmark (called a “raindrop”) in your Raindrop.io account.

## Features

* **One‑click bookmarking** – click the like/upvote button on Twitter/X, YouTube or Reddit and the post's primary link or canonical URL is saved to Raindrop.io.
* **Smart link extraction** – the content script looks for external links inside the post first. If none are found it falls back to the canonical URL of the post or the current page.
* **Non‑intrusive feedback** – toast notifications let you know when a bookmark is saved or if an error occurs.
* **Configurable defaults** – choose a default Raindrop.io collection and tags to apply to every bookmark.
* **Per‑site enable/disable** – toggle the extension on specific domains from the options page without editing code.
* **Extensible site config + hooks** – add support for new sites by editing a single configuration file (`src/scripts/site_selectors.js`) with selectors and optional per‑site hooks.

## Installation

1. Clone or download this repository and locate the `raindrop_extension` folder.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top right.
4. Click **Load unpacked** and choose the `raindrop_extension` directory. The extension icon should appear in your toolbar.

## Project Structure

```
raindrop_extension/
├─ build/                      # esbuild runner script (build.mjs)
├─ dist/                       # Compiled extension output (generated)
├─ icons/                      # Extension icons
├─ options/                    # Static HTML/CSS copied into dist/
├─ src/
│  ├─ config/
│  │  ├─ constants.js          # Shared API endpoints, timings, UI copy
│  │  └─ storage.js            # Promise-based helpers around chrome.storage
│  └─ scripts/
│     ├─ background.js        # Service worker: Raindrop API integration
│     ├─ content_script.js    # In-page interaction logic
│     └─ site_selectors.js    # Site config map and hooks
├─ manifest.json               # Chrome MV3 manifest (type: module)
├─ package.json                # Tooling & npm scripts
├─ LICENSE                     # MIT license
├─ CONTRIBUTING.md             # Contribution guide
└─ CODE_OF_CONDUCT.md          # Community guidelines
```

> **Note**: Source files live under `src/`. Run `npm run build` to produce the bundled extension inside `dist/` before loading it into Chrome.

## Getting Started (Development)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Produce a fresh build (outputs to `dist/`):
   ```bash
   npm run build
   ```
3. For iterative work, run the watcher to rebuild on change:
   ```bash
   npm run dev
   ```
4. Load the extension from the `dist/` directory via `chrome://extensions` → **Load unpacked**.

The build pipeline uses `esbuild` with an asset-copy plugin so that bundled JavaScript and static assets are always in sync. `npm run clean` removes the `dist/` directory.

## Generating a Raindrop.io Test Token

To allow the extension to create bookmarks, you need a **test token** from Raindrop.io:

1. Log in to your [Raindrop.io account](https://raindrop.io/).
2. Go to **Settings → Integrations** and locate the *API* section.
3. Click **Get test token** and copy the generated token. This token is used as a Bearer token in the `Authorization` header for every API call【790805987407026†L59-L66】.

Test tokens are scoped to your account and can be revoked at any time. Store it carefully – the extension only saves it locally using `chrome.storage.local`.

## Configuring the Extension

1. Right‑click the extension icon and choose **Options**, or click the extension in the toolbar and select **Options**.
2. Paste your test token into the **API Token** field.
3. After saving, the extension will validate your token and fetch your collections. Select a default collection or leave it unset to use your Inbox.
4. Enter comma‑separated default tags (e.g. `social, from-twitter`) if desired. These tags will be applied to every bookmark.
5. Use the checkboxes under **Enabled Domains** to turn the extension on or off for supported websites.
6. Click **Save settings** to persist your changes. Changes take effect immediately.

When configured correctly the status indicator will show **Connected** and your collection list will populate.

## Using the Extension

* On Twitter/X, click the ❤️ Like button beneath a tweet. The extension climbs the DOM to find the enclosing `<article>` and looks for the first external link. If found, that link is bookmarked. Otherwise the canonical tweet URL is saved.
* On YouTube, click the 👍 Like button beneath a video. Since videos are their own pages, the canonical video URL is saved.
* On Reddit, click the ⬆️ Upvote button on a post. The script inspects the post container (`data-testid="post-container"`) for an external link; if none exist the post URL is used.

A toast message will appear briefly confirming that the bookmark was saved. If the API token is invalid or the Raindrop.io API returns an error (including 429 rate‑limits) the toast will display an error message.

## How It Works

### Content Script

The content script is injected into each supported site when pages finish loading. It loads a configuration object from `scripts/site_selectors.js` to determine which buttons and containers to observe. Rather than relying on brittle CSS classes, the configuration uses stable attributes such as `data-testid` and `aria-label` to find the correct elements.

Each site can also provide small hook functions to customize behavior without touching the core code. See `src/scripts/site_selectors.js` for examples:

- `hooks.toggledOnAfterClick(button)`: return true only when a click toggles the positive state (like/upvote on)
- `hooks.getPermalink(button)`: return a canonical permalink; otherwise a generic extractor finds external links or falls back to canonical/current URL
- `hooks.getTitle(button)`: override the title
- `hooks.getExcerpt(button)`: override the excerpt/summary

When a supported like/upvote button is clicked, the flow is:

1. Debounce the event to avoid duplicate requests from rapid clicks.
2. Traverse up the DOM to find the nearest container element as defined in the configuration.
3. Search within that container for the first `<a>` tag whose domain differs from the current site. If found, that URL becomes the bookmark.
4. If no external link is found, fall back to the page’s canonical URL (from `<link rel="canonical">`) or `window.location.href`.
5. Send a message to the background script with the URL, page title and a short excerpt.
6. Use site hooks to compute permalink/title/excerpt when available.
7. Display a toast notification while waiting for the result.

### Background Script

The service worker (`src/scripts/background.js`) listens for messages and uses the Raindrop.io API to create bookmarks. When a `save` message arrives, it reads the token, default collection/tags, and debug flag via the shared storage helpers. It then calls `POST https://api.raindrop.io/rest/v1/raindrop` with the bookmark details. A 429 response triggers a configurable backoff window, while a 401 response clears the invalid token from storage and surfaces an error toast. The worker also exposes `getCollections` (`GET https://api.raindrop.io/rest/v1/collections` and `GET https://api.raindrop.io/rest/v1/collections/childrens`) and `validateToken` actions for the options UI.

### Options Page

The options page is a single HTML document styled with plain CSS. It dynamically loads the list of supported domains from `site_selectors.js` and builds a set of checkboxes. When a test token is entered and saved, the page sends a `validateToken` message to the background worker. If valid, a `getCollections` message is sent to fetch all collections, which are then displayed in a dropdown. The selected settings are persisted to `chrome.storage.local` and read by both the content and background scripts.

To add another website, edit `src/scripts/site_selectors.js`. Each entry maps a domain name (no `www`) to a **button selector** and a **container selector**, plus optional **hooks**.

Example:

```js
"example.com": {
  // CSS selector for the native like/upvote button
  buttonSelector: 'button[aria-label="Like"]',
  // Selector(s) for the element that wraps the entire post or article
  containerSelector: ['article', 'div.post'],
  // Optional hooks for site-specific logic
  hooks: {
    toggledOnAfterClick: async (button) => {
      await new Promise(r => setTimeout(r, 80));
      const el = button.closest('button') || button;
      return el && el.getAttribute('aria-pressed') === 'true';
    },
    getPermalink: (button) => {
      const container = button.closest('article') || document;
      const a = container.querySelector('a[href^="http"]');
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

Guidelines:

- Use attributes like `data-testid` or `aria-label` when possible; they are more stable than generated class names.
- Prefer returning stable permalinks (IDs or canonical URLs) in `getPermalink`.
- Keep hooks small and resilient; guard against missing nodes.

After editing the file:

- Reload the extension in `chrome://extensions`.
- Ensure the domain is listed in the Options page and enabled.
- If needed, add the domain to `manifest.json` under `host_permissions` and the `content_scripts[0].matches` list.

See `CONTRIBUTING.md` for a full checklist.

## Known Limitations

* **“Unlike” or “un‑upvote” actions do nothing.** Only positive clicks trigger bookmarking. This prevents accidental deletion from your Raindrop.io collection.
* **Rate limiting.** The Raindrop.io API allows a limited number of requests per minute. The extension applies a simple backoff if a 429 response is received. Repeatedly liking posts very quickly may result in temporary failures.
* **Link extraction heuristics.** The algorithm picks the first external link in the post container. Some posts contain multiple links; currently there is no way to choose which one is saved.

## Contributing
Pull requests and suggestions are welcome. See `CONTRIBUTING.md` for development setup, coding style, and the site‑addition checklist. Please follow the `CODE_OF_CONDUCT.md`.

## Debugging

- Enable "Debug logging" in the Options page to get verbose logs from the background service worker.
- To view service worker logs: open `chrome://extensions` → find the extension → "Service worker" → Inspect.
- For content script logs, open DevTools on the tab where you are testing.

## License

This project is licensed under the MIT License. See `LICENSE` for details.