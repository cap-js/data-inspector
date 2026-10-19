# Change Log

- All notable changes to this project are documented in this file.
- The format is based on [Keep a Changelog](https://keepachangelog.com/).
- This project adheres to [Semantic Versioning](https://semver.org/).

## Version 2.1.0 - 2026-10-14

### Added

- The SAPUI5 app's `manifest.json` now declares `sap.platform.cf.oAuthScopes` with the `$XSAPPNAME.capDataInspectorReadonly` scope. In SAP Build Work Zone / Cloud Portal Service, the launchpad tile is now hidden from users who lack the `capDataInspectorReadonly` role, instead of being shown to everyone and failing on data access.
- **New config option:** `cds.data-inspector.appId` to set the SAPUI5 app namespace / `sap.app.id` of the generated app. The `cds build` plugin rewrites the namespace consistently across the generated app (`manifest.json`, `Component.js`, controllers, views, fragments, `index.html`, `ui5*.yaml`), and `cds add data-inspector` uses the same value for the Cloud Portal `CommonDataModel.json` `appId`. This enables deploying the data-inspector in multiple CAP services on the same SAP BTP subaccount without HTML5 Application Repository app-id collisions. When not set, it defaults to `sap.cap.datainspector.datainspectorui` (no change for existing projects). Fixes [#81](https://github.com/cap-js/data-inspector/issues/81).

## Version 2.0.1 - 2026-10-13

### Fixed

- Enabled `relativePaths` in the `ui5-task-zipper` configuration so the built SAPUI5 app's `manifest.json` emits `dataSources.mainService.uri` as a relative URL (no leading slash). This fixes the issue where the UI could not reach the backend service when deployed via SAP Build Work Zone.

## Version 2.0.0 - 2026-09-16

### Breaking Changes

- **Build output folder renamed:** `gen/cap-js-data-inspector-ui` → `gen/cap-data-inspector-ui`. Any `mta.yaml` html5 module `path`, deployment scripts, or `@sap/html5-app-deployer` configurations pointing at the old folder must be updated.
- **MTA module renamed:** `capjsdatainspectorapp` → `capdatainspectorapp`. After re-running `cds add data-inspector`, manually remove the old `capjsdatainspectorapp` html5 module and its artifact entry from your `mta.yaml` to avoid duplicate/broken deployments.
- **UI no longer served by the CAP server for local runs:** The SAPUI5 app is no longer served at startup. Run the UI locally with `ui5 serve` from the generated `gen/cap-data-inspector-ui` folder (after running `cds build`). For BTP, deploy via the HTML5 Application Repository service.
- **`yaml` moved from dependency to peerDependency:** The `yaml` package is no longer bundled — consumers must have it available in their project. It is typically present via `@sap/cds-dk`; if not, add `yaml` to your `devDependencies`.

### Added

- **New config option:** `cds.data-inspector.authenticationType` (`xsuaa` | `ias`) to control the approuter `authenticationType` written into the generated `xs-app.json`. When not set, it is auto-detected from an existing `app/*/xs-app.json` and otherwise defaults to `xsuaa`. The generated `xs-app.json` no longer hardcodes `authenticationType: "xsuaa"`.
- **New config option:** `cds.data-inspector.odataV4BasePath` to set the OData V4 base path used in the generated `manifest.json` OData service URI, `xs-app.json` route, and `ui5.yaml` dev proxy. When not set, it falls back to `cds.protocols['odata-v4'].path` and then to the default `/odata/v4`.

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
