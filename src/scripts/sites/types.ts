/**
 * Type definitions for site providers
 */

import type { Timing as TimingType } from '../../config/constants.js';

/**
 * Context object passed to provider hooks
 */
export interface HookContext {
  /** Current hostname */
  host: string;
  
  /** Button selectors for this site */
  buttonSelectors: string[];
  
  /** Events to listen for */
  events: string[];
  
  /** Attach input listeners to a root element */
  attachInputListeners: (root: Element | Document) => void;
  
  /** Manually process a button element */
  processButton: (button: Element) => void;
  
  /** Shared state for deduplication and tracking */
  state: {
    lastEvent: { x: number; y: number; time: number };
    processedButtonsTS: WeakMap<Element, number>;
    lastOnState: WeakMap<Element, boolean>;
    preClickOnState: WeakMap<Element, boolean>;
  };
  
  /** Timing constants */
  timing: TimingType;
  
  /** Utility functions */
  utils: {
    wait: (ms: number) => Promise<void>;
    waitForCondition: (
      predicate: () => boolean,
      options?: { timeout?: number; interval?: number }
    ) => Promise<boolean>;
    normaliseText: (text: string | null | undefined, maxLen?: number) => string;
  };
  
  /** Check if debug logging is enabled */
  debugEnabled: () => boolean;
  
  /** Log debug message if enabled */
  debugLog: (...args: unknown[]) => void;
}

/**
 * Provider hooks for customizing behavior
 */
export interface ProviderHooks {
  /**
   * Determine if a click toggled the control to the ON state
   * @returns true if ON, false if OFF, undefined to use generic detection
   */
  toggledOnAfterClick?: (
    button: Element,
    ctx: HookContext
  ) => boolean | undefined | Promise<boolean | undefined>;
  
  /**
   * Get the canonical permalink for the content
   * @returns URL string or empty string to use generic extraction
   */
  getPermalink?: (button: Element, ctx: HookContext) => string | Promise<string>;
  
  /**
   * Get the title for the bookmark
   * @returns Title string
   */
  getTitle?: (button: Element, ctx: HookContext) => string | Promise<string>;
  
  /**
   * Get the excerpt/description for the bookmark
   * @returns Excerpt string
   */
  getExcerpt?: (button: Element, ctx: HookContext) => string | Promise<string>;
  
  /**
   * Handle clicks that don't match primary selectors
   * Useful for fallback detection strategies
   */
  handleUnmatchedClick?: (event: Event, ctx: HookContext) => void;
  
  /**
   * Initialize hook, called once after listeners are attached
   * Useful for setting up MutationObservers or shadow DOM listeners
   */
  onInit?: (ctx: HookContext) => void;
}

/**
 * Site provider configuration
 */
export interface SiteConfig {
  /** CSS selector(s) for the site's like/upvote button */
  buttonSelector: string | string[];
  
  /** CSS selector(s) for the content container */
  containerSelector: string | string[];
  
  /** Optional hooks for customizing behavior */
  hooks?: ProviderHooks;
}

/**
 * Provider registry entry
 */
export interface ProviderEntry {
  /** Hostname patterns to match (supports wildcards like *.domain.com) */
  match: string[];
  
  /** Lazy loader function that imports the provider module */
  loader: () => Promise<{ default: SiteConfig } | SiteConfig>;
}
