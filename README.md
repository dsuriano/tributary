![Tributary Banner](assets/tributary_banner.png)

Tributary: The Effortless Archive for Raindrop.io
-------------------------------------------------

Save interesting content from your social feeds straight into your Raindrop.io collections. Once configured, this extension listens for clicks on the native **Like**, **Bookmark**, or **Upvote** buttons on supported websites and automatically creates a bookmark in your Raindrop.io account.

### Features

-   **Instant Saves:** Tap Like or Upvote on Twitter/X, YouTube, or Reddit, and the extension quietly delivers the post's main link to Raindrop.io.
-   **Intelligent Link Detection:** The extension hunts for outbound links within a post and gracefully falls back to the canonical URL when no external links are available.
-   **Friendly Confirmations:** Lightweight toast messages celebrate every success and surface issues before they slow you down.
-   **Personalized Defaults:** Set your go-to collection and tags once, and every bookmark will land in the perfect spot.
-   **Domain-Level Control:** Use the options page to pause or resume the extension on individual sites with no code edits required.
-   **Built for Expansion:** Add support for more communities in minutes using modular site providers under `src/scripts/sites/` with a lightweight registry.

### Why Use This Extension?

-   **Save Content Instantly:** Capture links the moment you react to them, eliminating the need for extra clicks or to copy and paste URLs into Raindrop.io later.
-   **Keep Collections Curated:** Automatically apply your preferred collection and tag defaults so everything lands exactly where you expect it.
-   **Works with Major Platforms:** Ships with first-class support for Twitter/X, YouTube, and Reddit, and is easily extensible for more sites.
-   **Respectful by Design:** Stores tokens only in `chrome.storage.local`, offers visible toast feedback, and lets you disable individual domains when you need a quieter feed experience.

### Requirements

-   Google Chrome 110+ (or any Chromium-based browser that supports Manifest V3 and `chrome://extensions` developer mode).
-   Node.js 18+ and npm 9+ to run the build tooling.
-   A Raindrop.io account with access to generate a test token.

## Setup and Installation

1.  **Clone the Repository**

    Clone or download this repository, then open a terminal inside the project directory.

    ```bash
    git clone https://github.com/<your-org>/<your-repo>.git
    cd <your-repo>
    ```

2.  **Install Dependencies**

    Install the necessary Node.js dependencies.

    ```bash
    npm install
    ```

3.  **Build the Extension**

    Build the source into the `dist/` directory.

    ```bash
    npm run build
    ```

    For development, you can run the watcher to automatically rebuild whenever files change:

    ```bash
    npm run dev
    ```

4.  **Load the Extension in Chrome**

    a. Open Google Chrome and navigate to `chrome://extensions/`.
    b. Toggle **Developer mode** on in the top-right corner.
    c. Click **Load unpacked** and select the `dist/` directory from this project.
    d. The extension will appear in your list. Pin it to the toolbar for easy access.
    e. If you are running the `dev` watcher, click the **Refresh** button on the extension card in `chrome://extensions/` to load your changes.

### Project Structure

```
tributary/
├─ assets/                      # Project assets (e.g., README banner)
├─ build/                       # esbuild runner script (build.mjs)
├─ dist/                        # Compiled extension output (generated)
├─ icons/                       # Extension icons
├─ options/                     # Static HTML/CSS copied into dist/
├─ src/
│  ├─ config/
│  │  ├─ constants.js           # Shared API endpoints, timings, UI copy
│  │  └─ storage.js             # Promise-based helpers around chrome.storage
│  ├─ options/
│  │  └─ options.js            # Options page script (bundled to dist/options)
│  └─ scripts/
│     ├─ background.js         # Service worker: Raindrop API integration
│     ├─ content_script.js     # In-page interaction logic
│     └─ sites/                # Modular site providers + registry
│        ├─ index.js           # Hostname -> provider registry (lazy-loaded)
│        ├─ twitter.js         # Twitter/X provider
│        ├─ youtube.js         # YouTube provider
│        ├─ reddit.js          # Reddit provider
│        └─ generic.js         # Fallback provider
├─ manifest.json                # Chrome MV3 manifest (type: module)
├─ package.json                 # Tooling & npm scripts
├─ LICENSE                      # MIT license
├─ CONTRIBUTING.md              # Contribution guide
└─ CODE_OF_CONDUCT.md           # Community guidelines

> **Note**: Source files are located in the `src/` directory. Run `npm run build` to produce the bundled extension inside `dist/` before loading it into Chrome.

### Permissions

 The extension requests the minimal set of Chrome permissions needed to function, as defined in `manifest.json`:

- `permissions`
  - `storage`
- `host_permissions`
  - `*://*.twitter.com/*`
  - `*://*.x.com/*`
  - `*://*.youtube.com/*`
  - `*://*.reddit.com/*`
  - `https://api.raindrop.io/*`
- `options_page`
  - `options/options.html`
- `web_accessible_resources`
  - `scripts/sites/index.js`, `scripts/sites/*.js` (for dynamic provider loading)

 To allow the extension to create bookmarks, you need a **test token** from Raindrop.io:
 1. Log in to your Raindrop.io account.
 2. Go to **Settings → Integrations** and locate the **API** section.
 3. Click **Get test token** and copy the generated token. This token is used as a Bearer token in the `Authorization` header for every API call.

Test tokens are scoped to your account and can be revoked at any time. Store it carefully; the extension only saves it locally using `chrome.storage.local`.

### Configuring the Extension

1.  Open the extension's options page.
2.  Paste your test token into the **API Token** field.
3.  After saving, the extension will validate your token and fetch your collections. Select a default collection or leave it unset to use your Inbox.
4.  Enter comma-separated default tags (e.g., `social, from-twitter`) if desired. These tags will be applied to every bookmark.
5.  Use the checkboxes under **Enabled Domains** to turn the extension on or off for supported websites.
6.  Click **Save settings** to persist your changes. Changes take effect immediately.

When configured correctly, the status indicator will show **Connected** and your collection list will populate.

### Using the Extension

-   **On Twitter/X**, click the ❤️ **Like** button beneath a tweet. 
-   **On YouTube**, click the 👍 **Like** button beneath a video. 
-   **On Reddit**, click the ⬆️ **Upvote** button on a post. 

A toast message will appear briefly confirming that the bookmark was saved. If the API token is invalid or the Raindrop.io API returns an error (including 429 rate limits), the toast will display an error message.

### How It Works

#### Content Script

The content script is injected into each supported site when the page finishes loading. It lazily imports a site-specific provider via the registry in `scripts/sites/index.js` based on the current hostname. Rather than relying on brittle CSS classes, providers prefer stable attributes such as `data-testid` and `aria-label` to find the correct elements.

When a supported button is clicked, the following occurs:

1.  The event is debounced to avoid duplicate requests from rapid clicks.
2.  The script traverses up the DOM to find the nearest container element defined in the configuration.
3.  It searches within that container for the first `<a>` tag whose domain differs from the current site. If found, that URL is used for the bookmark.
4.  If no external link is found, it falls back to the page's canonical URL or `window.location.href`.
5.  A message containing the URL, page title, and a short excerpt is sent to the background script.
6.  A toast notification is displayed while awaiting the result.

Each site provider can also expose small hook functions to customize behavior. See `src/scripts/sites/twitter.js`, `src/scripts/sites/youtube.js`, or `src/scripts/sites/reddit.js` for examples:

-   `hooks.toggledOnAfterClick(button)`: Returns `true` only when a click toggles the positive state (e.g., the like button is now "on").
-   `hooks.getPermalink(button)`: Returns a canonical permalink.
-   `hooks.getTitle(button)`: Overrides the page title.
-   `hooks.getExcerpt(button)`: Overrides the summary excerpt.

#### Background Script

The service worker (`src/scripts/background.js`) listens for messages and uses the Raindrop.io API to create bookmarks. When a `save` message arrives, it reads the user's token and default settings and calls `POST https://api.raindrop.io/rest/v1/raindrop`. A 429 response triggers a configurable backoff window, while a 401 response clears the invalid token from storage and displays an error. The worker also handles API requests for the options page, such as `getCollections` and `validateToken`.

#### Adding a New Website

To add another website, create a provider file under `src/scripts/sites/` and register it in `src/scripts/sites/index.js`.

**Example provider (`src/scripts/sites/example.js`):**

```js
// Example provider for example.com
const example = {
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
      const a = container.querySelector('a[href^="http"]');
      return a ? a.href : '';
    },
    getTitle: () => document.title || '',
    getExcerpt: (button) => {
      const container = button.closest('article') || document;
      return (container.textContent || '').trim().slice(0, 500);
    }
  }
};

export default example;
```

**Register it (`src/scripts/sites/index.js`):**

```js
const providers = [
  { match: ['twitter.com', 'x.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/twitter.js')) },
  { match: ['youtube.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/youtube.js')) },
  { match: ['reddit.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/reddit.js')) },
  { match: ['example.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/example.js')) },
];
```

**Guidelines:**

-   Use stable attributes like `data-testid` or `aria-label` when possible.
-   Prefer returning stable permalinks in the `getPermalink` hook.
-   Keep hooks small and resilient to prevent errors from missing nodes.
-   Rebuild (`npm run build`) and reload the extension. Ensure the new domain shows up under Enabled Domains in the Options page (which reads from the registry) and is included in `manifest.json` `host_permissions`/`content_scripts.matches` if needed.

#### Provider Template

For a quick start, copy the template at `src/scripts/sites/_template.js` to a new file (e.g., `src/scripts/sites/example.js`) and adjust selectors/hooks. Then register it in `src/scripts/sites/index.js`.

The template includes sensible defaults for:

- `buttonSelector`
- `containerSelector`
- `hooks.toggledOnAfterClick`
- `hooks.getPermalink`
- `hooks.getTitle`
- `hooks.getExcerpt`

#### Wildcard Domains

The registry supports wildcard domain patterns in `match`, e.g. `*.medium.com`. Wildcards match the apex and any subdomain. Examples:

```js
const providers = [
  // Matches medium.com and any subdomain like blog.medium.com
  { match: ['*.medium.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/medium.js')) },
  // Matches the apex exactly
  { match: ['example.com'], loader: () => import(chrome.runtime.getURL('scripts/sites/example.js')) },
];
```

### Known Limitations

-   **"Unlike" actions are ignored.** Only positive clicks (Like, Upvote) trigger bookmarking. This prevents accidental deletion from your Raindrop.io collection.
-   **Rate Limiting.** The Raindrop.io API limits requests. The extension applies a simple backoff if a 429 response is received, but rapid clicks may still result in temporary failures.
-   **Link Extraction.** The algorithm picks the first external link it finds in a post. There is currently no way to choose which link is saved if a post contains multiple.

### Contributing

Pull requests and suggestions are welcome. See `CONTRIBUTING.md` for development setup and coding style. Please follow the `CODE_OF_CONDUCT.md`.

### Debugging

-   Enable "Debug logging" in the Options page to get verbose logs from the service worker.
-   To view service worker logs, go to `chrome://extensions`, find the extension, and click the "Service worker" link.
-   For content script logs, open the browser's DevTools on the tab where you are testing.

### License

This project is licensed under the MIT License. See the `LICENSE` file for details.