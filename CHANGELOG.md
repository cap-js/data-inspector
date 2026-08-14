# Change Log

- All notable changes to this project are documented in this file.
- The format is based on [Keep a Changelog](https://keepachangelog.com/).
- This project adheres to [Semantic Versioning](https://semver.org/).

## Version 1.1.0 - 2026-08-14

### Added

- **CAP Java host support:** the `cds build` task now detects Java projects and patches the generated UI with the correct OData base path, `xs-app.json` route, and `ui5.yaml` dev proxy — so the plugin works out of the box with CAP Java apps.
- New config options: `cds.data-inspector.odataBasePath` (custom OData endpoint path for Java hosts) and `cds.data-inspector.localServerUrl` (local dev server URL for `ui5 serve`).

### Changed

- The UI is no longer served by the CAP server (neither locally nor in the cloud). Run the UI locally with `ui5 serve` from the generated `gen/cap-data-inspector-ui` folder; deploy via HTML5 Application Repository for BTP.
- The Data Inspector service now uses an absolute `@path` annotation. For Node.js hosts the OData endpoint is always `/odata/v4/data-inspector/` (fixed, not configurable). The `odataBasePath` config option applies to **CAP Java hosts only**, where the base path can be customized (e.g. `/api`).
- **Build output folder renamed:** `gen/cap-js-data-inspector-ui` → `gen/cap-data-inspector-ui`. Update any references in your `mta.yaml` html5 module path or scripts that point to the old folder name.
- **`yaml` moved from dependency to peerDependency.** The `yaml` package is needed only at build time (`cds build` / `cds add`), not at app runtime. Consumers must have `yaml` installed in their project (it is typically already present via `@sap/cds-dk`).

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
