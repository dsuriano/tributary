# Social Media to Raindrop.io Chrome Extension

Save interesting content from your social feeds straight into your Raindrop.io collections. Once configured, this extension listens for clicks on the native **Like**, **Bookmark** or **Upvote** buttons on supported websites and automatically creates a bookmark (called a “raindrop”) in your Raindrop.io account.

## Features

* **One‑click bookmarking** – click the like/upvote button on Twitter/X, YouTube or Reddit and the post's primary link or canonical URL is saved to Raindrop.io.
* **Smart link extraction** – the content script looks for external links inside the post first. If none are found it falls back to the canonical URL of the post or the current page.
* **Non‑intrusive feedback** – toast notifications let you know when a bookmark is saved or if an error occurs.
* **Configurable defaults** – choose a default Raindrop.io collection and tags to apply to every bookmark.
* **Per‑site enable/disable** – toggle the extension on specific domains from the options page without editing code.
* **Extensible site config + hooks** – add support for new sites by editing a single configuration file (`scripts/site_selectors.js`) with selectors and optional per‑site hooks.

## Installation

1. Clone or download this repository and locate the `raindrop_extension` folder.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top right.
4. Click **Load unpacked** and choose the `raindrop_extension` directory. The extension icon should appear in your toolbar.

## Project Structure

```
raindrop_extension/
├─ scripts/
│  ├─ content_script.js        # Core logic running on supported sites
│  ├─ background.js            # Service worker: calls Raindrop API
│  └─ site_selectors.js        # Site config: selectors + optional hooks
├─ options/
│  ├─ options.html             # Options UI
│  ├─ options.css              # Options styles
│  └─ options.js               # Options logic
├─ icons/                      # Extension icons
├─ manifest.json               # Chrome MV3 manifest
├─ LICENSE                     # MIT license
├─ CONTRIBUTING.md             # Contribution guide
└─ CODE_OF_CONDUCT.md          # Community guidelines
```

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

Each site can also provide small hook functions to customize behavior without touching the core code:

- `hooks.toggledOnAfterClick(button)`: return true only when a click toggles the positive state (like/upvote on)
- `hooks.getPermalink(button)`: return a canonical permalink; otherwise a generic extractor finds external links or falls back to canonical/current URL
- `hooks.getTitle(button)`: override the title
- `hooks.getExcerpt(button)`: override the excerpt/summary

Once a native like/upvote button is clicked, the script:

1. Debounces the event to avoid duplicate requests from rapid clicks.
2. Traverses up the DOM to find the nearest container element as defined in the configuration.
3. Searches within that container for the first `<a>` tag whose domain differs from the current site. If found, that URL becomes the bookmark.
4. If no external link is found, falls back to the page’s canonical URL (from `<link rel="canonical">`) or `window.location.href`.
5. Sends a message to the background script with the URL, page title and a short excerpt.
6. Uses site hooks to compute permalink/title/excerpt when available.
7. Displays a toast notification while waiting for the result.

### Background Script

The service worker listens for messages and uses the Raindrop.io API to create bookmarks. When a `save` message arrives, it retrieves the stored API token, default collection and tags from `chrome.storage.local`, constructs a POST request and calls `POST https://api.raindrop.io/rest/v1/raindrop`【626947988996100†L98-L103】 with the bookmark details. If the call succeeds the response contains a `result: true` flag and the worker notifies the content script of success. A 429 response triggers a simple 60‑second backoff, while a 401 response indicates an invalid token. The worker also provides helper actions to fetch collections (`GET https://api.raindrop.io/rest/v1/collections`【844453685848287†L74-L79】 and `GET https://api.raindrop.io/rest/v1/collections/childrens`【844453685848287†L118-L124】) and validate tokens.

### Options Page

The options page is a single HTML document styled with plain CSS. It dynamically loads the list of supported domains from `site_selectors.js` and builds a set of checkboxes. When a test token is entered and saved, the page sends a `validateToken` message to the background worker. If valid, a `getCollections` message is sent to fetch all collections, which are then displayed in a dropdown. The selected settings are persisted to `chrome.storage.local` and read by both the content and background scripts.

## Adding Support for New Sites

To add another website, edit `scripts/site_selectors.js`. Each entry maps a domain name (no `www`) to a **button selector** and a **container selector**, plus optional **hooks**.

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