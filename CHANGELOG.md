# Change Log

- All notable changes to this project are documented in this file.
- The format is based on [Keep a Changelog](https://keepachangelog.com/).
- This project adheres to [Semantic Versioning](https://semver.org/).

## Version 2.0.0 - 2026-09-10

### Breaking Changes

- **Build output folder renamed:** `gen/cap-js-data-inspector-ui` → `gen/cap-data-inspector-ui`. Any `mta.yaml` html5 module `path`, deployment scripts, or `@sap/html5-app-deployer` configurations pointing at the old folder must be updated.
- **MTA module renamed:** `capjsdatainspectorapp` → `capdatainspectorapp`. After re-running `cds add data-inspector`, manually remove the old `capjsdatainspectorapp` html5 module and its artifact entry from your `mta.yaml` to avoid duplicate/broken deployments.
- **UI no longer served by the CAP server for local runs:** The SAPUI5 app is no longer served at startup. Run the UI locally with `ui5 serve` from the generated `gen/cap-data-inspector-ui` folder (after running `cds build`). For BTP, deploy via the HTML5 Application Repository service.
- **Absolute OData endpoint:** The Data Inspector service now uses an absolute `@path` annotation. For Node.js hosts the OData endpoint is always `/odata/v4/data-inspector/` regardless of configuration.
- **`yaml` moved from dependency to peerDependency:** The `yaml` package is no longer bundled — consumers must have it available in their project. It is typically present via `@sap/cds-dk`; if not, add `yaml` to your `devDependencies`.

### Added

- **CAP Java host support:** the `cds build` task now detects Java projects and patches the generated UI with the correct `manifest.json` OData base path, `xs-app.json` route, and `ui5.yaml` dev proxy.
- **New config option:** `cds.data-inspector.authenticationType` (`xsuaa` | `ias`) to control the approuter `authenticationType` written into the generated `xs-app.json`. When not set, it is auto-detected from an existing `app/*/xs-app.json` and otherwise defaults to `xsuaa`. The generated `xs-app.json` no longer hardcodes `authenticationType: "xsuaa"`.
- **New config option:** `cds.data-inspector.odataBasePath` (custom OData endpoint path, for CAP Java hosts only).

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
