import { describe, test, expect, beforeEach } from '@jest/globals';
import twitter from '../../src/scripts/sites/twitter.js';
import { createTwitterPost, setToggleState } from '../helpers/dom-helpers.js';

describe('Twitter Provider', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.location.hostname = 'twitter.com';
    window.location.origin = 'https://twitter.com';
  });

  describe('buttonSelector', () => {
    test('should match like button', () => {
      const post = createTwitterPost();
      document.body.appendChild(post);

      const likeButton = document.querySelector('[data-testid="like"]');
      expect(likeButton).not.toBeNull();
      expect(likeButton.matches(twitter.buttonSelector[0])).toBe(true);
    });

    test('should match unlike button', () => {
      const post = createTwitterPost();
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      button.setAttribute('data-testid', 'unlike');

      const unlikeButton = document.querySelector('[data-testid="unlike"]');
      expect(unlikeButton).not.toBeNull();
      expect(unlikeButton.matches(twitter.buttonSelector[1])).toBe(true);
    });
  });

  describe('toggledOnAfterClick', () => {
    test('should return true when aria-pressed is true', async () => {
      const post = createTwitterPost();
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      setToggleState(button, true);

      const result = await twitter.hooks.toggledOnAfterClick(button);
      expect(result).toBe(true);
    });

    test('should return false when aria-pressed is false', async () => {
      const post = createTwitterPost();
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      setToggleState(button, false);

      const result = await twitter.hooks.toggledOnAfterClick(button);
      expect(result).toBe(false);
    });

    test('should detect unlike button as toggled on', async () => {
      const post = createTwitterPost();
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      button.setAttribute('data-testid', 'unlike');

      const result = await twitter.hooks.toggledOnAfterClick(button);
      expect(result).toBe(true);
    });

    test('should check nested elements for toggle state', async () => {
      const post = createTwitterPost();
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const inner = document.createElement('span');
      inner.setAttribute('aria-pressed', 'true');
      button.appendChild(inner);

      const result = await twitter.hooks.toggledOnAfterClick(button);
      expect(result).toBe(true);
    });
  });

  describe('getPermalink', () => {
    test('should extract tweet permalink from article', () => {
      const post = createTwitterPost({
        tweetId: '1234567890',
        username: 'testuser',
      });
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const permalink = twitter.hooks.getPermalink(button);

      expect(permalink).toBe('https://twitter.com/testuser/status/1234567890');
    });

    test('should clean query parameters from permalink', () => {
      const post = createTwitterPost({
        tweetId: '1234567890',
        username: 'testuser',
      });
      document.body.appendChild(post);

      const statusLink = post.querySelector('a[href*="/status/"]');
      statusLink.href = 'https://twitter.com/testuser/status/1234567890?s=20&t=abc123';

      const button = document.querySelector('[data-testid="like"]');
      const permalink = twitter.hooks.getPermalink(button);

      expect(permalink).toBe('https://twitter.com/testuser/status/1234567890');
      expect(permalink).not.toContain('?');
    });

    test('should remove hash from permalink', () => {
      const post = createTwitterPost({
        tweetId: '1234567890',
        username: 'testuser',
      });
      document.body.appendChild(post);

      const statusLink = post.querySelector('a[href*="/status/"]');
      statusLink.href = 'https://twitter.com/testuser/status/1234567890#reply';

      const button = document.querySelector('[data-testid="like"]');
      const permalink = twitter.hooks.getPermalink(button);

      expect(permalink).toBe('https://twitter.com/testuser/status/1234567890');
      expect(permalink).not.toContain('#');
    });

    test('should use last status link when multiple exist', () => {
      const post = createTwitterPost({
        tweetId: '1234567890',
        username: 'testuser',
      });

      // Add another status link (quoted tweet)
      const quotedLink = document.createElement('a');
      quotedLink.href = 'https://twitter.com/otheruser/status/9999999';
      post.insertBefore(quotedLink, post.firstChild);

      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const permalink = twitter.hooks.getPermalink(button);

      // Should use the last status link (the actual tweet, not quoted)
      expect(permalink).toBe('https://twitter.com/testuser/status/1234567890');
    });

    test('should return empty string if no article found', () => {
      const button = document.createElement('button');
      button.setAttribute('data-testid', 'like');
      document.body.appendChild(button);

      const permalink = twitter.hooks.getPermalink(button);
      expect(permalink).toBe('');
    });
  });

  describe('getTitle', () => {
    test('should extract tweet text as title', () => {
      const tweetText = 'This is a test tweet with some content';
      const post = createTwitterPost({ text: tweetText });
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const title = twitter.hooks.getTitle(button);

      expect(title).toBe(tweetText);
    });

    test('should limit title to 80 characters', () => {
      const longText = 'a'.repeat(200);
      const post = createTwitterPost({ text: longText });
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const title = twitter.hooks.getTitle(button);

      expect(title.length).toBe(80);
    });

    test('should combine multiple tweet text elements', () => {
      const post = createTwitterPost({ text: 'First part' });
      
      const secondText = document.createElement('div');
      secondText.setAttribute('data-testid', 'tweetText');
      secondText.textContent = 'Second part';
      post.appendChild(secondText);

      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const title = twitter.hooks.getTitle(button);

      expect(title).toContain('First part');
      expect(title).toContain('Second part');
    });

    test('should fallback to document.title if no tweet text', () => {
      document.title = 'Twitter / Home';
      const post = createTwitterPost();
      post.querySelector('[data-testid="tweetText"]').remove();
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const title = twitter.hooks.getTitle(button);

      expect(title).toBe('Twitter / Home');
    });
  });

  describe('getExcerpt', () => {
    test('should extract tweet text as excerpt', () => {
      const tweetText = 'This is a test tweet with some content';
      const post = createTwitterPost({ text: tweetText });
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const excerpt = twitter.hooks.getExcerpt(button);

      expect(excerpt).toBe(tweetText);
    });

    test('should limit excerpt to 500 characters', () => {
      const longText = 'a'.repeat(1000);
      const post = createTwitterPost({ text: longText });
      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const excerpt = twitter.hooks.getExcerpt(button);

      expect(excerpt.length).toBe(500);
    });

    test('should combine multiple tweet text elements', () => {
      const post = createTwitterPost({ text: 'First part' });
      
      const secondText = document.createElement('div');
      secondText.setAttribute('data-testid', 'tweetText');
      secondText.textContent = 'Second part';
      post.appendChild(secondText);

      document.body.appendChild(post);

      const button = document.querySelector('[data-testid="like"]');
      const excerpt = twitter.hooks.getExcerpt(button);

      expect(excerpt).toContain('First part');
      expect(excerpt).toContain('Second part');
    });

    test('should return empty string if no article found', () => {
      const button = document.createElement('button');
      button.setAttribute('data-testid', 'like');
      document.body.appendChild(button);

      const excerpt = twitter.hooks.getExcerpt(button);
      expect(excerpt).toBe('');
    });
  });

  describe('containerSelector', () => {
    test('should be article element', () => {
      expect(twitter.containerSelector).toBe('article');
    });
  });
});
