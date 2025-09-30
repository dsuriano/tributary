import { describe, test, expect, beforeEach } from 'vitest';
import reddit from '../../src/scripts/sites/reddit.ts';
import { createRedditPost, setToggleState } from '../helpers/dom-helpers.js';

describe('Reddit Provider', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.location.hostname = 'reddit.com';
    window.location.origin = 'https://reddit.com';
  });

  describe('buttonSelector', () => {
    test('should match upvote button by aria-label', () => {
      const post = createRedditPost();
      document.body.appendChild(post);

      const upvoteButton = document.querySelector('button[aria-label="upvote"]');
      expect(upvoteButton).not.toBeNull();
      expect(upvoteButton.matches(reddit.buttonSelector[0])).toBe(true);
    });

    test('should match upvote button with data-post-click-location', () => {
      const post = createRedditPost();
      document.body.appendChild(post);

      const button = document.querySelector('button[data-post-click-location="vote"]');
      expect(button).not.toBeNull();
      expect(button.matches(reddit.buttonSelector[2])).toBe(true);
    });
  });

  describe('toggledOnAfterClick', () => {
    test('should return true when aria-pressed is true', async () => {
      const post = createRedditPost();
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      setToggleState(button, true);

      const result = await reddit.hooks.toggledOnAfterClick(button);
      expect(result).toBe(true);
    });

    test('should return false when aria-pressed is false', async () => {
      const post = createRedditPost();
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      setToggleState(button, false);

      const result = await reddit.hooks.toggledOnAfterClick(button);
      expect(result).toBe(false);
    });

    test('should check aria-checked attribute', async () => {
      const post = createRedditPost();
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      button.setAttribute('aria-checked', 'true');

      const result = await reddit.hooks.toggledOnAfterClick(button);
      expect(result).toBe(true);
    });
  });

  describe('getPermalink', () => {
    test('should extract external link when present', () => {
      const externalUrl = 'https://example.com/article';
      const post = createRedditPost({
        hasExternalLink: true,
        externalUrl,
      });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const permalink = reddit.hooks.getPermalink(button);

      expect(permalink).toBe(externalUrl);
    });

    test('should fallback to comments link when no external link', () => {
      const post = createRedditPost({
        postId: 'abc123',
        subreddit: 'test',
      });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const permalink = reddit.hooks.getPermalink(button);

      expect(permalink).toContain('/r/test/comments/abc123');
    });

    test('should clean query params from external links', () => {
      const post = createRedditPost({
        hasExternalLink: true,
        externalUrl: 'https://example.com/article?utm_source=reddit',
      });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const permalink = reddit.hooks.getPermalink(button);

      expect(permalink).toBe('https://example.com/article');
      expect(permalink).not.toContain('?');
    });

    test('should remove hash from URLs', () => {
      const post = createRedditPost({
        hasExternalLink: true,
        externalUrl: 'https://example.com/article#section',
      });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const permalink = reddit.hooks.getPermalink(button);

      expect(permalink).toBe('https://example.com/article');
      expect(permalink).not.toContain('#');
    });

    test('should ignore internal reddit links', () => {
      const post = createRedditPost({
        postId: 'abc123',
        subreddit: 'test',
      });
      
      // Add internal reddit link
      const internalLink = document.createElement('a');
      internalLink.href = 'https://reddit.com/r/test';
      post.insertBefore(internalLink, post.firstChild);

      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const permalink = reddit.hooks.getPermalink(button);

      // Should use comments link, not internal link
      expect(permalink).toContain('/comments/');
    });

    test('should fallback to window.location.href if no links found', () => {
      const post = createRedditPost();
      post.querySelector('a[data-click-id="comments"]').remove();
      document.body.appendChild(post);

      window.location.href = 'https://reddit.com/r/test/comments/abc123/post/';

      const button = document.querySelector('button[aria-label="upvote"]');
      const permalink = reddit.hooks.getPermalink(button);

      expect(permalink).toBe(window.location.href);
    });
  });

  describe('getTitle', () => {
    test('should extract post title', () => {
      const postTitle = 'This is a test post title';
      const post = createRedditPost({ title: postTitle });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const title = reddit.hooks.getTitle(button);

      expect(title).toBe(postTitle);
    });

    test('should limit title to 200 characters', () => {
      const longTitle = 'a'.repeat(500);
      const post = createRedditPost({ title: longTitle });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const title = reddit.hooks.getTitle(button);

      expect(title.length).toBe(200);
    });

    test('should remove URLs from title', () => {
      const titleWithUrl = 'Check this out https://example.com/link amazing!';
      const post = createRedditPost({ title: titleWithUrl });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const title = reddit.hooks.getTitle(button);

      expect(title).not.toContain('https://');
      expect(title).toContain('Check this out');
      expect(title).toContain('amazing!');
    });

    test('should normalize whitespace in title', () => {
      const titleWithSpaces = 'Title   with    multiple     spaces';
      const post = createRedditPost({ title: titleWithSpaces });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const title = reddit.hooks.getTitle(button);

      expect(title).toBe('Title with multiple spaces');
    });

    test('should fallback to document.title if no post title', () => {
      document.title = 'Reddit - Post Title';
      const post = createRedditPost();
      post.querySelector('[data-testid="post-title"]').remove();
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const title = reddit.hooks.getTitle(button);

      expect(title).toContain('Reddit');
    });
  });

  describe('getExcerpt', () => {
    test('should extract post body text', () => {
      const bodyText = 'This is the post body content';
      const post = createRedditPost({ body: bodyText });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const excerpt = reddit.hooks.getExcerpt(button);

      expect(excerpt).toBe(bodyText);
    });

    test('should limit excerpt to 1000 characters', () => {
      const longBody = 'a'.repeat(2000);
      const post = createRedditPost({ body: longBody });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const excerpt = reddit.hooks.getExcerpt(button);

      expect(excerpt.length).toBe(1000);
    });

    test('should normalize whitespace in excerpt', () => {
      const bodyWithSpaces = 'Body   with    multiple     spaces';
      const post = createRedditPost({ body: bodyWithSpaces });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const excerpt = reddit.hooks.getExcerpt(button);

      expect(excerpt).toBe('Body with multiple spaces');
    });

    test('should fallback to title if no body', () => {
      const postTitle = 'Post title as excerpt';
      const post = createRedditPost({ title: postTitle, body: '' });
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const excerpt = reddit.hooks.getExcerpt(button);

      expect(excerpt).toContain(postTitle);
    });

    test('should return empty string if no content found', () => {
      const post = createRedditPost({ body: '' });
      post.querySelector('[data-testid="post-title"]').remove();
      post.querySelector('[data-click-id="text"]')?.remove();
      document.body.appendChild(post);

      const button = document.querySelector('button[aria-label="upvote"]');
      const excerpt = reddit.hooks.getExcerpt(button);

      expect(excerpt).toBe('');
    });
  });

  describe('containerSelector', () => {
    test('should include post-container', () => {
      expect(reddit.containerSelector).toContain('div[data-testid="post-container"]');
    });

    test('should include article as fallback', () => {
      expect(reddit.containerSelector).toContain('article');
    });
  });
});
