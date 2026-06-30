# Change Log

- All notable changes to this project are documented in this file.
- The format is based on [Keep a Changelog](https://keepachangelog.com/).
- This project adheres to [Semantic Versioning](https://semver.org/).

## Version 1.0.5 - 2026-06-25

### Fixed

- Compatibility with `@sap/cds-dk` 9.9+: replaced usage of `cds.utils.yaml.load` / `cds.utils.yaml.dump` (no longer exposed) with the stable [`yaml`](https://www.npmjs.com/package/yaml) package's `parse` / `stringify` API in the MTA configurator and related tests. Both the read and write paths in `mtaHelper.ts` now use the `yaml` package directly instead of CDS-internal helpers (`cds.utils.yaml` and `cds.parse.yaml`).

### Added

- Added `yaml` as a direct dependency to decouple from `@sap/cds` / `@sap/cds-dk` internals and protect against future API changes.

## Version 1.0.4 - 2026-06-18

### Changed

- Published Readme file

## Version 1.0.1 - 2026-06-01

### Changed

- Initial Release - publish to NPM

## Version 1.0.0 - 2026-04-07

### Added

- Initial release
