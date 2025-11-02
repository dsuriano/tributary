# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Nothing yet.

## [1.2.1] - 2025-11-02

### Changed

- Firefox: set default `browser_specific_settings.gecko.id` to `tributary@tributary.click` and allow override via `EXTENSION_GECKO_ID`.

## [1.2.0] - 2025-11-02

### Added

- Firefox build target with manifest transforms to support temporary add-ons and Gecko-specific background scripts.

### Changed

- CI build verification now checks per-target output directories for Chrome and Firefox bundles.
- Playwright E2E fixtures accept an `EXTENSION_TARGET` environment variable so tests can run against either bundle.

### Fixed

- Documentation updated with Firefox requirements, load instructions, and test commands.

## [1.1.0] - 2025-10-14

### Added

- GitHub integration that saves repositories to Raindrop.io whenever you star them, including logic to distinguish star vs. unstar actions.
- Enriched bookmark metadata for GitHub stars: titles now append the repository description and excerpts capture the entire About panel content.
- Automated tests and DOM helpers covering the GitHub provider selectors, toggle detection, permalink, title, and excerpt extraction.

### Changed

- Updated README to document GitHub support across features, usage instructions, and provider hooks.
- Added the GitHub provider to the documented project structure for quick discovery.

### Fixed

- None.

## [1.0.0] - 2025-10-03

### Added

- Initial release of the Tributary Chrome extension for Raindrop.io with Manifest V3 support.
- One-click bookmarking triggered by likes or upvotes on Twitter/X, YouTube, and Reddit.
- Automatic outbound link detection with canonical URL fallback to ensure reliable saves.
- Toast notifications surfacing success and error feedback for every background save.
- Options page for managing Raindrop API tokens, default collections, tags, per-domain enablement, and debug logging.
- Modular site provider registry under `src/scripts/sites/` with type-safe contracts for rapid expansion to new platforms.
- Background service worker integration with Raindrop.io, including token validation and rate-limit backoff handling.
- Promise-based storage helpers around `chrome.storage` exposed in `src/config/storage.ts`.
- Tooling stack with TypeScript, esbuild bundler, Vitest unit/integration tests, and Playwright end-to-end suites.
- GitHub Actions workflow for automated packaging and release artifacts.

### Documentation

- Authored README, CONTRIBUTING, and TESTING guides covering setup, development workflow, and debugging practices.

[Unreleased]: https://github.com/dsuriano/tributary/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/dsuriano/tributary/releases/tag/v1.2.1
[1.2.0]: https://github.com/dsuriano/tributary/releases/tag/v1.2.0
[1.1.0]: https://github.com/dsuriano/tributary/releases/tag/v1.1.0
[1.0.0]: https://github.com/dsuriano/tributary/releases/tag/v1.0.0
