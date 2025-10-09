import type { SiteConfig } from './types.js';

/**
 * GitHub provider
 * 
 * Saves repositories to Raindrop when the user stars them.
 * Only triggers on star actions (not unstar).
 */
const github: SiteConfig = {
  buttonSelector: [
    // GitHub's star button can be identified by these attributes
    'button[data-hydro-click*="STAR"]', // GitHub uses uppercase in JSON
    'button[data-aria-prefix*="Star"]',
    'button[aria-label*="tar"]' // Matches both "Star" and "Starred"
  ],
  containerSelector: 'body',
  hooks: {
    toggledOnAfterClick: async (button, ctx): Promise<boolean> => {
      // GitHub's star button shows "Star" when unstarred, "Starred" when starred
      // We check the button text BEFORE the click to determine the action
      const innerBtn = button.closest('button') || button;
      const buttonText = (innerBtn?.textContent || '').trim().toLowerCase();
      const ariaLabel = (innerBtn?.getAttribute('aria-label') || '').toLowerCase();
      
      // Determine if the repository was already starred before the click
      const wasAlreadyStarred = buttonText.includes('starred') 
        || buttonText === 'unstar'
        || ariaLabel.includes('unstar');
      
      // Only save when starring (not when unstarring)
      if (!wasAlreadyStarred) {
        ctx.debugLog('[GitHub] Star action detected, saving repository');
        return true;
      } else {
        ctx.debugLog('[GitHub] Unstar action detected, not saving');
        return false;
      }
    },
    
    getPermalink: (): string => {
      // Extract the canonical repository URL (owner/repo) from the current page
      try {
        const url = new URL(window.location.href);
        const pathParts = url.pathname.split('/').filter(Boolean);
        
        // GitHub repo URLs follow the pattern: github.com/owner/repo
        if (pathParts.length >= 2) {
          const owner = pathParts[0];
          const repo = pathParts[1];
          return `https://github.com/${owner}/${repo}`;
        }
        
        // Fallback: clean current URL
        url.search = '';
        url.hash = '';
        return url.href;
      } catch (_) {
        return window.location.href;
      }
    },
    
    getTitle: (): string => {
      // Extract repository name in "owner/repo" format
      const repoHeader = document.querySelector('h1 strong a')
        || document.querySelector('strong[itemprop="name"] a')
        || document.querySelector('h1 a[href*="/"]');
      
      let repoTitle = '';
      
      if (repoHeader?.textContent) {
        const repoName = repoHeader.textContent.trim();
        
        // Look for the owner name in the same h1 element
        const h1 = repoHeader.closest('h1');
        const ownerLink = h1?.querySelector('a[data-hovercard-type="user"]')
          || h1?.querySelector('a[rel="author"]');
        
        if (ownerLink?.textContent && ownerLink !== repoHeader) {
          const ownerName = ownerLink.textContent.trim();
          repoTitle = `${ownerName}/${repoName}`;
        } else {
          repoTitle = repoName;
        }
      } else {
        // Fallback: parse from document title (format: "owner/repo: description")
        const title = document.title || '';
        const match = title.match(/^([^:]+)/);
        repoTitle = (match && match[1]) ? match[1].trim() : title;
      }
      
      // Add description to the title
      const descriptionEl = document.querySelector('p.f4.my-3');
      if (descriptionEl?.textContent) {
        const description = descriptionEl.textContent.trim();
        if (description) {
          return `${repoTitle} - ${description}`;
        }
      }
      
      return repoTitle;
    },
    
    getExcerpt: (): string => {
      // Extract the entire About section content
      // The About section is in a div with class "BorderGrid-cell" 
      const aboutSection = document.querySelector('div.BorderGrid-cell');
      if (aboutSection?.textContent) {
        const text = aboutSection.textContent
          .trim()
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/\n+/g, ' '); // Remove newlines
        
        if (text && text.length > 10) {
          return text.slice(0, 1000); // Increased to 1000 chars to capture more details
        }
      }
      
      // Fallback: just get the description paragraph
      const descriptionEl = document.querySelector('p.f4.my-3');
      if (descriptionEl?.textContent) {
        const text = descriptionEl.textContent.trim();
        if (text) {
          return text.slice(0, 500);
        }
      }
      
      // Fallback to meta description tag
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc instanceof HTMLMetaElement && metaDesc.content) {
        return metaDesc.content.trim().slice(0, 500);
      }
      
      return '';
    }
  }
};

export default github;
