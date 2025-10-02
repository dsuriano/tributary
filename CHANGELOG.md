# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Nothing yet.

### Changed

- Nothing yet.

### Fixed

- Nothing yet.

## [1.0.0] - 2025-10-01

### Added

- Initial release of the Tributary Chrome extension for Raindrop.io.
- One-click saves triggered by likes or upvotes on Twitter/X, YouTube, and Reddit.
- Intelligent outbound link detection with canonical URL fallback.
- Toast-based success and error feedback for background saves.
- Options page for managing API tokens, default collections, tags, and per-domain enablement.
- Modular site provider registry under `src/scripts/sites/` for rapid expansion to new platforms.
- Background service worker integration with the Raindrop.io API, including rate-limit backoff.
- Comprehensive tooling: TypeScript, esbuild bundler, Vitest unit tests, and Playwright end-to-end tests.
- GitHub Actions workflow for automated packaging and release artifacts.
