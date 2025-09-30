import { describe, test, expect, beforeEach } from 'vitest';
import youtube from '../../src/scripts/sites/youtube.ts';
import { createYouTubeVideo, setToggleState } from '../helpers/dom-helpers.js';

describe('YouTube Provider', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.location.hostname = 'youtube.com';
    window.location.origin = 'https://youtube.com';
    window.location.pathname = '/watch';
    window.location.href = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
  });

  describe('buttonSelector', () => {
    test('should match like button by id', () => {
      const video = createYouTubeVideo();
      document.body.appendChild(video);

      const likeButton = document.querySelector('button#like-button');
      expect(likeButton).not.toBeNull();
      expect(likeButton.matches(youtube.buttonSelector[0])).toBe(true);
    });

    test('should match button inside toggle renderer', () => {
      const video = createYouTubeVideo();
      document.body.appendChild(video);

      const button = document.querySelector('ytd-toggle-button-renderer button');
      expect(button).not.toBeNull();
      expect(button.matches(youtube.buttonSelector[1])).toBe(true);
    });
  });

  describe('toggledOnAfterClick', () => {
    test('should return true when aria-pressed is true', async () => {
      const video = createYouTubeVideo();
      document.body.appendChild(video);

      const button = document.querySelector('button#like-button');
      setToggleState(button, true);

      const result = await youtube.hooks.toggledOnAfterClick(button);
      expect(result).toBe(true);
    });

    test('should return false when aria-pressed is false', async () => {
      const video = createYouTubeVideo();
      document.body.appendChild(video);

      const button = document.querySelector('button#like-button');
      setToggleState(button, false);

      const result = await youtube.hooks.toggledOnAfterClick(button);
      expect(result).toBe(false);
    });

    test('should check toggle renderer for button state', async () => {
      const video = createYouTubeVideo();
      document.body.appendChild(video);

      const button = document.querySelector('button#like-button');
      const renderer = button.closest('ytd-toggle-button-renderer');
      
      // Set state on inner button
      button.setAttribute('aria-pressed', 'true');

      const result = await youtube.hooks.toggledOnAfterClick(renderer);
      expect(result).toBe(true);
    });
  });

  describe('getPermalink', () => {
    test('should extract video ID from watch URL', () => {
      window.location.href = 'https://youtube.com/watch?v=dQw4w9WgXcQ';
      window.location.pathname = '/watch';
      window.location.search = '?v=dQw4w9WgXcQ';

      // Mock URL constructor to work with window.location
      const originalURL = global.URL;
      global.URL = class extends originalURL {
        constructor(url, base) {
          if (url === window.location.href) {
            super('https://youtube.com/watch?v=dQw4w9WgXcQ');
          } else {
            super(url, base);
          }
        }
      };

      const permalink = youtube.hooks.getPermalink();
      expect(permalink).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');

      global.URL = originalURL;
    });

    test('should extract shorts ID from shorts URL', () => {
      window.location.href = 'https://youtube.com/shorts/abc123xyz';
      window.location.pathname = '/shorts/abc123xyz';

      const originalURL = global.URL;
      global.URL = class extends originalURL {
        constructor(url, base) {
          if (url === window.location.href) {
            super('https://youtube.com/shorts/abc123xyz');
          } else {
            super(url, base);
          }
        }
      };

      const permalink = youtube.hooks.getPermalink();
      expect(permalink).toBe('https://youtube.com/shorts/abc123xyz');

      global.URL = originalURL;
    });

    test('should return empty string for invalid URL', () => {
      window.location.href = 'https://youtube.com/';
      window.location.pathname = '/';

      const originalURL = global.URL;
      global.URL = class extends originalURL {
        constructor(url, base) {
          if (url === window.location.href) {
            super('https://youtube.com/');
          } else {
            super(url, base);
          }
        }
      };

      const permalink = youtube.hooks.getPermalink();
      expect(permalink).toBe('');

      global.URL = originalURL;
    });
  });

  describe('getTitle', () => {
    test('should extract title from page', async () => {
      const videoTitle = 'Amazing Test Video';
      const video = createYouTubeVideo({ title: videoTitle });
      document.body.appendChild(video);

      const title = await youtube.hooks.getTitle();
      expect(title).toBe(videoTitle);
    });

    test('should extract title from JSON-LD', async () => {
      const videoTitle = 'Video from JSON-LD';
      const video = createYouTubeVideo({ title: videoTitle });
      document.body.appendChild(video);

      const title = await youtube.hooks.getTitle();
      expect(title).toBe(videoTitle);
    });

    test('should limit title to 200 characters', async () => {
      const longTitle = 'a'.repeat(500);
      const video = createYouTubeVideo({ title: longTitle });
      document.body.appendChild(video);

      const title = await youtube.hooks.getTitle();
      expect(title.length).toBe(200);
    });

    test('should handle shorts videos', async () => {
      window.location.pathname = '/shorts/abc123';
      
      const shortsTitle = 'Shorts Video Title';
      const video = createYouTubeVideo({ title: shortsTitle, isShorts: true });
      document.body.appendChild(video);

      const title = await youtube.hooks.getTitle();
      expect(title).toBe(shortsTitle);
    });
  });

  describe('getExcerpt', () => {
    test('should extract description from page', async () => {
      const description = 'This is a test video description';
      const video = createYouTubeVideo({ description });
      document.body.appendChild(video);

      const excerpt = await youtube.hooks.getExcerpt();
      expect(excerpt).toBe(description);
    });

    test('should extract description from JSON-LD', async () => {
      const description = 'Description from JSON-LD';
      const video = createYouTubeVideo({ description });
      document.body.appendChild(video);

      const excerpt = await youtube.hooks.getExcerpt();
      expect(excerpt).toBe(description);
    });

    test('should handle shorts videos', async () => {
      window.location.pathname = '/shorts/abc123';
      
      const description = 'Shorts video description';
      const video = createYouTubeVideo({ description, isShorts: true });
      document.body.appendChild(video);

      const excerpt = await youtube.hooks.getExcerpt();
      expect(excerpt).toBe(description);
    });

    test('should return empty string if no description found', async () => {
      const video = createYouTubeVideo({ description: '' });
      video.querySelector('#description-inline-expander').remove();
      video.querySelector('script[type="application/ld+json"]').remove();
      document.body.appendChild(video);

      // Provide a mock context with shorter timeouts to avoid test timeout
      const mockCtx = {
        timing: { YOUTUBE_DESCRIPTION_RETRY_MS: 10 },
        utils: {
          wait: (ms) => Promise.resolve(),
          waitForCondition: (fn, opts) => Promise.resolve(false)
        }
      };

      const excerpt = await youtube.hooks.getExcerpt(null, mockCtx);
      expect(excerpt).toBe('');
    });
  });

  describe('containerSelector', () => {
    test('should include ytd-watch-metadata', () => {
      expect(youtube.containerSelector).toContain('ytd-watch-metadata');
    });

    test('should include body as fallback', () => {
      expect(youtube.containerSelector).toContain('body');
    });
  });
});
