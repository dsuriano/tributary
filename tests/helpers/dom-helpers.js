/**
 * Test helpers for DOM manipulation and assertions
 */

/**
 * Create a mock Twitter post element
 */
export function createTwitterPost({ tweetId = '123456', username = 'testuser', text = 'Test tweet content', hasExternalLink = false, externalUrl = 'https://example.com' } = {}) {
  const article = document.createElement('article');
  article.setAttribute('data-testid', 'tweet');
  article.setAttribute('role', 'article');

  // Tweet text
  const tweetText = document.createElement('div');
  tweetText.setAttribute('data-testid', 'tweetText');
  tweetText.textContent = text;
  article.appendChild(tweetText);

  // Status link (permalink)
  const statusLink = document.createElement('a');
  statusLink.href = `https://twitter.com/${username}/status/${tweetId}`;
  statusLink.setAttribute('aria-label', 'View tweet');
  article.appendChild(statusLink);

  // External link (if provided)
  if (hasExternalLink) {
    const externalLink = document.createElement('a');
    externalLink.href = externalUrl;
    externalLink.textContent = 'External link';
    article.appendChild(externalLink);
  }

  // Like button
  const likeButton = document.createElement('button');
  likeButton.setAttribute('data-testid', 'like');
  likeButton.setAttribute('aria-label', 'Like');
  likeButton.setAttribute('aria-pressed', 'false');
  article.appendChild(likeButton);

  return article;
}

/**
 * Create a mock YouTube video page
 */
export function createYouTubeVideo({ videoId = 'dQw4w9WgXcQ', title = 'Test Video', description = 'Test video description', isShorts = false } = {}) {
  const container = document.createElement('div');

  // Video title
  const titleEl = document.createElement('h1');
  const titleSpan = document.createElement('yt-formatted-string');
  titleSpan.textContent = title;
  titleEl.appendChild(titleSpan);
  
  const metadata = document.createElement('ytd-watch-metadata');
  metadata.appendChild(titleEl);
  container.appendChild(metadata);

  // Description
  const descContainer = document.createElement('ytd-text-inline-expander');
  descContainer.id = 'description-inline-expander';
  const descExpanded = document.createElement('div');
  descExpanded.id = 'expanded';
  descExpanded.textContent = description;
  descContainer.appendChild(descExpanded);
  metadata.appendChild(descContainer);

  // Like button
  const likeButton = document.createElement('button');
  likeButton.id = 'like-button';
  likeButton.setAttribute('aria-label', 'Like this video');
  likeButton.setAttribute('aria-pressed', 'false');
  
  const toggleRenderer = document.createElement('ytd-toggle-button-renderer');
  toggleRenderer.appendChild(likeButton);
  container.appendChild(toggleRenderer);

  // JSON-LD structured data
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@type': 'VideoObject',
    name: title,
    description: description,
    uploadDate: '2025-01-01',
  });
  container.appendChild(script);

  return container;
}

/**
 * Create a mock Reddit post
 */
export function createRedditPost({ postId = 'abc123', subreddit = 'test', title = 'Test Post', body = 'Test post body', hasExternalLink = false, externalUrl = 'https://example.com' } = {}) {
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'post-container');

  // Post title
  const titleEl = document.createElement('h1');
  titleEl.setAttribute('data-testid', 'post-title');
  titleEl.textContent = title;
  container.appendChild(titleEl);

  // Post body
  if (body) {
    const bodyEl = document.createElement('div');
    bodyEl.setAttribute('data-click-id', 'text');
    bodyEl.textContent = body;
    container.appendChild(bodyEl);
  }

  // Comments link
  const commentsLink = document.createElement('a');
  commentsLink.setAttribute('data-click-id', 'comments');
  commentsLink.href = `/r/${subreddit}/comments/${postId}/test_post/`;
  commentsLink.textContent = 'Comments';
  container.appendChild(commentsLink);

  // External link (if provided)
  if (hasExternalLink) {
    const externalLink = document.createElement('a');
    externalLink.setAttribute('data-click-id', 'body');
    externalLink.href = externalUrl;
    externalLink.textContent = 'External link';
    container.appendChild(externalLink);
  }

  // Upvote button
  const upvoteButton = document.createElement('button');
  upvoteButton.setAttribute('aria-label', 'upvote');
  upvoteButton.setAttribute('aria-pressed', 'false');
  upvoteButton.setAttribute('data-post-click-location', 'vote');
  container.appendChild(upvoteButton);

  return container;
}

/**
 * Simulate a click event on an element
 */
export function simulateClick(element, options = {}) {
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...options,
  });
  element.dispatchEvent(clickEvent);
  return clickEvent;
}

/**
 * Wait for a condition to be true
 */
export function waitFor(condition, { timeout = 1000, interval = 50 } = {}) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      try {
        if (condition()) {
          clearInterval(timer);
          resolve(true);
        } else if (Date.now() - startTime >= timeout) {
          clearInterval(timer);
          reject(new Error('Timeout waiting for condition'));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, interval);
  });
}

/**
 * Set aria-pressed attribute to simulate toggle state
 */
export function setToggleState(element, pressed) {
  element.setAttribute('aria-pressed', String(pressed));
}

/**
 * Create a mock GitHub repository page
 * Mimics the actual GitHub DOM structure with realistic attributes
 */
export function createGitHubRepo({ owner = 'testuser', repo = 'testrepo', description = 'Test repository description', isStarred = false, starCount = 1200 } = {}) {
  const container = document.createElement('div');

  // Repository header
  const header = document.createElement('h1');
  
  const ownerLink = document.createElement('a');
  ownerLink.setAttribute('data-hovercard-type', 'user');
  ownerLink.textContent = owner;
  ownerLink.href = `/${owner}`;
  header.appendChild(ownerLink);

  header.appendChild(document.createTextNode(' / '));

  const repoStrong = document.createElement('strong');
  const repoLink = document.createElement('a');
  repoLink.textContent = repo;
  repoLink.href = `/${owner}/${repo}`;
  repoStrong.appendChild(repoLink);
  header.appendChild(repoStrong);

  container.appendChild(header);

  // Repository description
  if (description) {
    const descEl = document.createElement('p');
    descEl.textContent = description;
    container.appendChild(descEl);
  }

  // Star button - matches actual GitHub structure
  const starButton = document.createElement('button');
  
  // GitHub uses "Star this repository" / "Unstar this repository" in aria-label
  // but shows "Star" / "Starred" as button text
  const ariaLabel = isStarred 
    ? `Unstar this repository (${starCount})` 
    : `Star this repository (${starCount})`;
  const buttonText = isStarred ? 'Starred' : 'Star';
  
  starButton.setAttribute('aria-label', ariaLabel);
  starButton.setAttribute('data-aria-prefix', isStarred ? 'Unstar this repository' : 'Star this repository');
  starButton.setAttribute('data-hydro-click', JSON.stringify({
    event_type: 'repository.click',
    payload: { target: 'STAR_BUTTON' }
  }));
  starButton.textContent = buttonText;
  
  container.appendChild(starButton);

  return container;
}
