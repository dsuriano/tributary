import { describe, test, expect, beforeEach } from 'vitest';
import github from '../../src/scripts/sites/github.ts';
import { createGitHubRepo } from '../helpers/dom-helpers.js';

describe('GitHub Provider', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.location.hostname = 'github.com';
    window.location.origin = 'https://github.com';
  });

  describe('buttonSelector', () => {
    test('should match star button by data-hydro-click', () => {
      const button = document.createElement('button');
      // GitHub uses uppercase STAR in the JSON data attribute
      button.setAttribute('data-hydro-click', '{"event_type":"repository.click","payload":{"target":"STAR_BUTTON"}}');
      button.textContent = 'Star';
      document.body.appendChild(button);

      expect(button.matches(github.buttonSelector[0])).toBe(true);
    });

    test('should match star button by data-aria-prefix', () => {
      const button = document.createElement('button');
      button.setAttribute('data-aria-prefix', 'Star this repository');
      button.textContent = 'Star';
      document.body.appendChild(button);

      expect(button.matches(github.buttonSelector[1])).toBe(true);
    });

    test('should match star button by aria-label', () => {
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Star this repository (1.2k)');
      button.textContent = 'Star';
      document.body.appendChild(button);

      expect(button.matches(github.buttonSelector[2])).toBe(true);
    });

    test('should match starred button by aria-label', () => {
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Unstar this repository (1.2k)');
      button.textContent = 'Starred';
      document.body.appendChild(button);

      // Should match because aria-label contains "tar"
      expect(button.matches(github.buttonSelector[2])).toBe(true);
    });
  });

  describe('toggledOnAfterClick', () => {
    test('should return true when button text is "Star" (starring action)', async () => {
      const button = document.createElement('button');
      button.textContent = 'Star';
      button.setAttribute('aria-label', 'Star this repository (1.2k)');
      document.body.appendChild(button);
      
      const mockContext = {
        debugLog: () => {}
      };

      // Button shows "Star" = starring action = save
      const result = await github.hooks.toggledOnAfterClick(button, mockContext);
      expect(result).toBe(true);
    });

    test('should return false when button text is "Starred" (unstarring action)', async () => {
      const button = document.createElement('button');
      button.textContent = 'Starred';
      button.setAttribute('aria-label', 'Unstar this repository (1.2k)');
      document.body.appendChild(button);
      
      const mockContext = {
        debugLog: () => {}
      };

      // Button shows "Starred" = unstarring action = don't save
      const result = await github.hooks.toggledOnAfterClick(button, mockContext);
      expect(result).toBe(false);
    });

    test('should detect starring from button text with whitespace', async () => {
      const button = document.createElement('button');
      button.textContent = '  Star  \n  1.2k  ';
      document.body.appendChild(button);
      
      const mockContext = {
        debugLog: () => {}
      };

      const result = await github.hooks.toggledOnAfterClick(button, mockContext);
      expect(result).toBe(true);
    });

    test('should detect unstarring from button text with count', async () => {
      const button = document.createElement('button');
      button.textContent = 'Starred 1.2k';
      document.body.appendChild(button);
      
      const mockContext = {
        debugLog: () => {}
      };

      const result = await github.hooks.toggledOnAfterClick(button, mockContext);
      expect(result).toBe(false);
    });
  });

  describe('getPermalink', () => {
    test('should extract repository URL', () => {
      const repo = createGitHubRepo({
        owner: 'facebook',
        repo: 'react'
      });
      document.body.appendChild(repo);

      // Mock window.location
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/facebook/react',
          pathname: '/facebook/react'
        },
        writable: true
      });

      const button = document.querySelector('button[aria-label*="Star"]');
      const permalink = github.hooks.getPermalink(button);

      expect(permalink).toBe('https://github.com/facebook/react');
    });

    test('should clean query parameters from permalink', () => {
      const repo = createGitHubRepo({
        owner: 'facebook',
        repo: 'react'
      });
      document.body.appendChild(repo);

      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/facebook/react?tab=readme-ov-file',
          pathname: '/facebook/react',
          search: '?tab=readme-ov-file',
          hash: ''
        },
        writable: true
      });

      const button = document.querySelector('button[aria-label*="Star"]');
      const permalink = github.hooks.getPermalink(button);

      expect(permalink).toBe('https://github.com/facebook/react');
      expect(permalink).not.toContain('?');
    });

    test('should remove hash from permalink', () => {
      const repo = createGitHubRepo({
        owner: 'facebook',
        repo: 'react'
      });
      document.body.appendChild(repo);

      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/facebook/react#readme',
          pathname: '/facebook/react',
          search: '',
          hash: '#readme'
        },
        writable: true
      });

      const button = document.querySelector('button[aria-label*="Star"]');
      const permalink = github.hooks.getPermalink(button);

      expect(permalink).toBe('https://github.com/facebook/react');
      expect(permalink).not.toContain('#');
    });

    test('should handle deep paths by extracting owner/repo', () => {
      const repo = createGitHubRepo({
        owner: 'facebook',
        repo: 'react'
      });
      document.body.appendChild(repo);

      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://github.com/facebook/react/issues/123',
          pathname: '/facebook/react/issues/123'
        },
        writable: true
      });

      const button = document.querySelector('button[aria-label*="Star"]');
      const permalink = github.hooks.getPermalink(button);

      expect(permalink).toBe('https://github.com/facebook/react');
    });
  });

  describe('getTitle', () => {
    test('should extract owner/repo with description as title', () => {
      const description = 'A declarative, efficient, and flexible JavaScript library for building user interfaces.';
      const repo = createGitHubRepo({
        owner: 'facebook',
        repo: 'react',
        description
      });
      document.body.appendChild(repo);

      const button = document.querySelector('button[aria-label*="Star"]');
      const title = github.hooks.getTitle(button);

      expect(title).toBe(`facebook/react - ${description}`);
    });

    test('should extract owner/repo without description if none exists', () => {
      const repo = createGitHubRepo({
        owner: 'facebook',
        repo: 'react',
        description: ''
      });
      document.body.appendChild(repo);

      const button = document.querySelector('button[aria-label*="Star"]');
      const title = github.hooks.getTitle(button);

      expect(title).toBe('facebook/react');
    });

    test('should extract just repo name with description if owner not found', () => {
      const container = document.createElement('div');
      const header = document.createElement('h1');
      const strong = document.createElement('strong');
      const link = document.createElement('a');
      link.textContent = 'react';
      strong.appendChild(link);
      header.appendChild(strong);
      container.appendChild(header);

      // Add description
      const aboutSection = document.createElement('div');
      aboutSection.className = 'BorderGrid-cell';
      const desc = document.createElement('p');
      desc.className = 'f4 my-3';
      desc.textContent = 'A JavaScript library';
      aboutSection.appendChild(desc);
      container.appendChild(aboutSection);

      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Star this repository');
      container.appendChild(button);

      document.body.appendChild(container);

      const title = github.hooks.getTitle(button);
      expect(title).toBe('react - A JavaScript library');
    });

    test('should fallback to document.title', () => {
      document.title = 'facebook/react: A declarative, efficient, and flexible JavaScript library';
      const button = document.createElement('button');
      button.setAttribute('aria-label', 'Star this repository');
      document.body.appendChild(button);

      const title = github.hooks.getTitle(button);
      expect(title).toBe('facebook/react');
    });
  });

  describe('getExcerpt', () => {
    test('should extract About section content', () => {
      const description = 'A declarative, efficient, and flexible JavaScript library for building user interfaces.';
      const repo = createGitHubRepo({
        owner: 'facebook',
        repo: 'react',
        description
      });
      document.body.appendChild(repo);

      const button = document.querySelector('button[aria-label*="Star"]');
      const excerpt = github.hooks.getExcerpt(button);

      // Should contain the description (whitespace normalized)
      expect(excerpt).toContain(description);
    });

    test('should limit excerpt to 1000 characters', () => {
      const longDescription = 'a'.repeat(2000);
      const repo = createGitHubRepo({
        description: longDescription
      });
      document.body.appendChild(repo);

      const button = document.querySelector('button[aria-label*="Star"]');
      const excerpt = github.hooks.getExcerpt(button);

      expect(excerpt.length).toBe(1000);
    });

    test('should return empty string if no About section found', () => {
      const repo = createGitHubRepo({
        description: ''
      });
      document.body.appendChild(repo);

      const button = document.querySelector('button[aria-label*="Star"]');
      const excerpt = github.hooks.getExcerpt(button);

      expect(excerpt).toBe('');
    });
  });

  describe('containerSelector', () => {
    test('should be body element', () => {
      expect(github.containerSelector).toBe('body');
    });
  });
});
