Social Media to Raindrop.io Chrome Extension
--------------------------------------------

Save interesting content from your social feeds straight into your Raindrop.io collections. Once configured, this extension listens for clicks on the native **Like**, **Bookmark**, or **Upvote** buttons on supported websites and automatically creates a bookmark in your Raindrop.io account.

### Features

-   **Instant Saves:** Tap Like or Upvote on Twitter/X, YouTube, or Reddit, and the extension quietly delivers the post's main link to Raindrop.io.
-   **Intelligent Link Detection:** The extension hunts for outbound links within a post and gracefully falls back to the canonical URL when no external links are available.
-   **Friendly Confirmations:** Lightweight toast messages celebrate every success and surface issues before they slow you down.
-   **Personalized Defaults:** Set your go-to collection and tags once, and every bookmark will land in the perfect spot.
-   **Domain-Level Control:** Use the options page to pause or resume the extension on individual sites with no code edits required.
-   **Built for Expansion:** Add support for more communities in minutes by adding new selectors or optional hooks into `src/scripts/site_selectors.js`.

### Why Use This Extension?

-   **Save Content Instantly:** Capture links the moment you react to them, eliminating the need for extra clicks or to copy and paste URLs into Raindrop.io later.
-   **Keep Collections Curated:** Automatically apply your preferred collection and tag defaults so everything lands exactly where you expect it.
-   **Works with Major Platforms:** Ships with first-class support for Twitter/X, YouTube, and Reddit, and is easily extensible for more sites.
-   **Respectful by Design:** Stores tokens only in `chrome.storage.local`, offers visible toast feedback, and lets you disable individual domains when you need a quieter feed experience.

### Requirements

-   Google Chrome 110+ (or any Chromium-based browser that supports Manifest V3 and `chrome://extensions` developer mode).
-   Node.js 18+ and npm 9+ to run the build tooling.
-   A Raindrop.io account with access to generate a test token.

### Installation

1.  Clone or download this repository, then open a terminal inside the `raindrop_extension/` directory.\
    *Note: You will need to replace `<your-org>` with the correct repository path.*

    bash

    ```
    git clone https://github.com/<your-org>/raindrop_extension.git
    cd raindrop_extension
    ```

2.  Install the JavaScript dependencies.

    bash
    ```
    npm install
    ```

3.  Build the extension bundle and copy static assets into the `dist/` directory. This command removes any previous `dist/` contents and regenerates all necessary assets.

    bash
    ```
    npm run build
    ```

4.  Open Google Chrome and navigate to `chrome://extensions/`.
5.  Toggle **Developer mode** on in the top-right corner of the page.
6.  Click **Load unpacked**, then browse to and select the freshly generated `dist/` directory.
7.  Confirm the extension appears in the list. If desired, pin it to the toolbar for quick access.
8.  When you make code changes later, rerun `npm run build` (or keep `npm run dev` running) and then click the **Refresh** button on the extension card inside `chrome://extensions/`.

### Project Structure

mipsasm

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

> **Note**: Source files are located in the `src/` directory. Run `npm run build` to produce the bundled extension inside `dist/` before loading it into Chrome.

### Getting Started (Development)

1.  Install dependencies:

    bash

    ```
    npm install
    ```

2.  Produce a fresh build, which outputs to the `dist/` directory:

    bash
    ```
    npm run build
    ```

3.  For iterative work, run the watcher to rebuild automatically on changes:

    bash
    ```
    npm run dev
    ```

4.  Load the extension from the `dist/` directory via `chrome://extensions` → **Load unpacked**.

To allow the extension to create bookmarks, you need a **test token** from Raindrop.io:

1.  Log in to your Raindrop.io account.
2.  Go to **Settings → Integrations** and locate the **API** section.
3.  Click **Get test token** and copy the generated token. This token is used as a Bearer token in the `Authorization` header for every API call.

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

-   **On Twitter/X**, click the ❤️ **Like** button beneath a tweet. The extension climbs the DOM to find the enclosing `<article>` and looks for the first external link. If found, that link is bookmarked. Otherwise, the canonical tweet URL is saved.
-   **On YouTube**, click the 👍 **Like** button beneath a video. The canonical video URL is saved.
-   **On Reddit**, click the ⬆️ **Upvote** button on a post. The script inspects the post container for an external link; if none exists, the post URL is used.

A toast message will appear briefly confirming that the bookmark was saved. If the API token is invalid or the Raindrop.io API returns an error (including 429 rate limits), the toast will display an error message.

### How It Works

#### Content Script

The content script is injected into each supported site when the page finishes loading. It uses a configuration object from `scripts/site_selectors.js` to determine which buttons and containers to observe. Rather than relying on brittle CSS classes, the configuration uses stable attributes such as `data-testid` and `aria-label` to find the correct elements.

When a supported button is clicked, the following occurs:

1.  The event is debounced to avoid duplicate requests from rapid clicks.
2.  The script traverses up the DOM to find the nearest container element defined in the configuration.
3.  It searches within that container for the first `<a>` tag whose domain differs from the current site. If found, that URL is used for the bookmark.
4.  If no external link is found, it falls back to the page's canonical URL or `window.location.href`.
5.  A message containing the URL, page title, and a short excerpt is sent to the background script.
6.  A toast notification is displayed while awaiting the result.

Each site can also provide small hook functions to customize behavior. See `src/scripts/site_selectors.js` for examples:

-   `hooks.toggledOnAfterClick(button)`: Returns `true` only when a click toggles the positive state (e.g., the like button is now "on").
-   `hooks.getPermalink(button)`: Returns a canonical permalink.
-   `hooks.getTitle(button)`: Overrides the page title.
-   `hooks.getExcerpt(button)`: Overrides the summary excerpt.

#### Background Script

The service worker (`src/scripts/background.js`) listens for messages and uses the Raindrop.io API to create bookmarks. When a `save` message arrives, it reads the user's token and default settings and calls `POST https://api.raindrop.io/rest/v1/raindrop`. A 429 response triggers a configurable backoff window, while a 401 response clears the invalid token from storage and displays an error. The worker also handles API requests for the options page, such as `getCollections` and `validateToken`.

#### Adding a New Website

To add another website, edit `src/scripts/site_selectors.js`. Each entry maps a domain name to a `buttonSelector` and a `containerSelector`, plus optional `hooks`.

**Example:**

javascript

```
"example.com": {
  // CSS selector for the native like/upvote button
  buttonSelector: 'button[aria-label="Like"]',
  // Selector(s) for the element that wraps the entire post
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
    }
  }
}
```

**Guidelines:**

-   Use stable attributes like `data-testid` or `aria-label` when possible.
-   Prefer returning stable permalinks in the `getPermalink` hook.
-   Keep hooks small and resilient to prevent errors from missing nodes.
-   After editing the file, reload the extension and ensure the new domain is enabled in the Options page and added to `manifest.json`.

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