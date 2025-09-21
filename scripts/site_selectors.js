// Mapping of supported sites to their button and container selectors.
// Each entry corresponds to a domain name (without www) and defines
// how to find the native like/upvote/bookmark button and the parent
// container that encapsulates the content. This separation of
// selectors makes it easy to extend support to new websites without
// touching the core logic of the extension.

const siteSelectors = {
  /**
   * Twitter/X
   *
   * The like button on Twitter uses a `data-testid="like"` attribute.
   * Tweets are contained within an <article> element so we limit
   * traversal to the closest article when extracting links. Any
   * external anchor within the article will be saved; otherwise we
   * fall back to the canonical URL of the tweet.
   */
  'twitter.com': {
    buttonSelector: '[data-testid="like"]',
    containerSelector: 'article'
  },
  'x.com': {
    buttonSelector: '[data-testid="like"]',
    containerSelector: 'article'
  },

  /**
   * YouTube
   *
   * YouTube's like button is rendered inside a #like-button element. We
   * include a few possible selectors as fallbacks to maximise
   * resilience against UI changes. The container selector falls back
   * to the watch metadata element and then the entire document
   * because the video page itself is the content being saved.
   */
  'youtube.com': {
    buttonSelector: [
      'button#like-button',
      'ytd-toggle-button-renderer button',
      'button[aria-label*="like"]'
    ],
    containerSelector: ['ytd-watch-metadata', 'body']
  },

  /**
   * Reddit
   *
   * Upvote buttons on Reddit use an aria-label of "upvote". Posts are
   * encapsulated in a <div> with data-testid="post-container" or
   * sometimes an <article>. These selectors allow us to locate the
   * correct container for link extraction.
   */
  'reddit.com': {
    buttonSelector: 'button[aria-label="upvote"]',
    containerSelector: ['div[data-testid="post-container"]', 'article']
  }
};

export default siteSelectors;