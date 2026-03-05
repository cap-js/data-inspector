[![REUSE status](https://api.reuse.software/badge/github.com/cap-js/data-inspector)](https://api.reuse.software/info/github.com/cap-js/data-inspector)

# Data Inspector

- [Data Inspector](#data-inspector)
  - [About this project](#about-this-project)
    - [Features](#features)
  - [Requirements and Setup](#requirements-and-setup)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Setup with `cds add data-inspector`](#setup-with-cds-add-data-inspector)
    - [UI5 App for Deployment to BTP](#ui5-app-for-deployment-to-btp)
      - [How the Build Plugin Works](#how-the-build-plugin-works)
      - [MTA Deployment](#mta-deployment)
        - [1. Add `html5` module](#1-add-html5-module)
        - [2. Include UI5 App Artifact](#2-include-ui5-app-artifact)
      - [@sap/html5-app-deployer](#saphtml5-app-deployer)
      - [Custom Destination Name](#custom-destination-name)
      - [sap.cloud.service Configuration](#sapcloudservice-configuration)
      - [Using Cloud Portal Service](#using-cloud-portal-service)
      - [Using SAP Build Work Zone](#using-sap-build-work-zone)
        - [What `cds add data-inspector` Configures](#what-cds-add-data-inspector-configures)
        - [Prerequisites](#prerequisites-1)
        - [Manual CDM Configuration](#manual-cdm-configuration)
        - [CDM Format Reference](#cdm-format-reference)
    - [(Optional) flpSandbox.html Configuration for the UI5 App Tile for Local Testing](#optional-flpsandboxhtml-configuration-for-the-ui5-app-tile-for-local-testing)
    - [Authorization](#authorization)
    - [Excluding Entities and Elements](#excluding-entities-and-elements)
    - [Audit Logging](#audit-logging)
  - [Testing the Plugin Directly](#testing-the-plugin-directly)
  - [Support, Feedback, Contributing](#support-feedback-contributing)
  - [Security / Disclosure](#security--disclosure)
  - [Code of Conduct](#code-of-conduct)
  - [Licensing](#licensing)

## About this project

`@cap-js/data-inspector` is a CAP Node.js plugin to view data content of CDS [`Entities`](https://cap.cloud.sap/docs/cds/cdl#entity-definitions) defined in a CAP Node.js application. It comes with a UI5 app consumable out-of-the-box.

### Features

- Provided `xsuaa` scope for access control
- Exclude entities and elements from the UI5 app display
- Automatic audit logging of access to personal sensitive data (via [`@cap-js/audit-logging`](https://github.com/cap-js/audit-logging#readme))

## Requirements and Setup

### Prerequisites

1. Ensure your project uses `@sap/cds` version 9.
2. Set up the `xsuaa` BTP service for authorization.
3. (Optional) Add [`@cap-js/audit-logging`](https://github.com/cap-js/audit-logging#readme) and the `auditlog` BTP service for audit logging.

### Installation

_Internal npm registry detail to be added until publishing at npmjs.com_

Install the plugin in your CAP Node.js project.

```sh
npm install @cap-js/data-inspector
```

Running your CAP project locally with `cds serve` or `cds watch` will now serve the UI5 app on the `@sap/cds` web application endpoint `/data-inspector-ui`. Make sure to add neccessary authorizataion scope to your mock user. See [Authorization](#authorization).

### Setup with `cds add data-inspector`

Run the following command to add `@cap-js/data-inspector` configuration to your project.

```sh
cds add data-inspector
```

It makes the following changes to your project.

- **XSUAA**: Adds the `xsuaa` scope `capDataInspectorReadonly` in your `xs-security.json`. Make sure to use this scope in appropriate role collections. Also see [Authorization](#authorization).
- **MTA configuration** (when `mta.yaml` exists): Adds the following configuration to your `mta.yaml`. Also see [MTA Deployment](#mta-deployment).
  - Adds `html5` module `capjsdatainspectorapp` pointing to the build output in `gen/cap-js-data-inspector-ui`.
  - Adds the `capjsdatainspectorapp` artifact to the HTML5 content module (the `com.sap.application.content` module that targets your `html5-apps-repo` `app-host` resource).
- **Cloud Portal Service** (when detected in `mta.yaml`): Adds `catalog` and `group` configuration for the data-inspector tile to your `CommonDataModel.json`. The file location is determined by inspecting `mta.yaml` for the portal content deployer module's `path` property — for example, if the module's path is `flp`, the file is at `flp/portal-site/CommonDataModel.json`. Also see [Using Cloud Portal Service](#using-cloud-portal-service).
- **SAP Build Work Zone** (when `mta.yaml` exists): Adds the MTA module and artifact wiring only. The Workzone CDM configuration (`cdm.json`) must be edited manually because it uses project-specific entity IDs. An informational message is logged after the command runs. Also see [Using SAP Build Work Zone](#using-sap-build-work-zone).

### UI5 App for Deployment to BTP

#### How the Build Plugin Works

`@cap-js/data-inspector` ships a CDS build plugin that runs during `cds build`. The plugin:

1. **Copies** the UI5 app source from the plugin package into `gen/cap-js-data-inspector-ui`.
2. **Patches `xs-app.json`** with the correct backend destination name (auto-detected from your project or configurable via `cds.env`). See [Custom Destination Name](#custom-destination-name).
3. **Patches `manifest.json`** with `sap.cloud.service` when a value is available from `cds.env` or auto-detected from an existing UI5 app in the project. See [sap.cloud.service Configuration](#sapcloudservice-configuration).

The resulting `gen/cap-js-data-inspector-ui` folder is the single source of truth for deployment, whether you use MTA or `@sap/html5-app-deployer`.

#### MTA Deployment

MTA (`mta.yaml`) is used for Cloud Foundry deployments and can also be used for Kyma deployments. The UI5 app in `gen/cap-js-data-inspector-ui` is referenced by an `html5` module in `mta.yaml` and included in the HTML5 content module for deployment to the `HTML5 Application Repository` service. Running `cds add data-inspector` configures this automatically.

##### 1. Add `html5` module

The `html5` module points to the build output folder where the UI5 app has already been copied and patched by the CDS build plugin.

```yaml
- name: capjsdatainspectorapp
  type: html5
  path: gen/cap-js-data-inspector-ui
  build-parameters:
    build-result: dist
    builder: custom
    commands:
      - npm install
      - npm run build:cf
    supported-platforms: []
```

##### 2. Include UI5 App Artifact

Include the UI5 app artifact in your HTML5 content module — the `com.sap.application.content` module that targets your `html5-apps-repo` `app-host` resource:

```yaml
- name: <your app content module name>
  type: com.sap.application.content
  path: <your app content module path>
  requires:
    - name: <your html5-apps-repo app-host resource name>
      parameters:
        content-target: true
  build-parameters:
    build-result: <your desired module build output path>
    requires:
      - name: capjsdatainspectorapp
        artifacts:
          - datainspectorapp.zip
        target-path: <your desired html5 app artifact build output path>
```

#### @sap/html5-app-deployer

[`@sap/html5-app-deployer`](https://www.npmjs.com/package/@sap/html5-app-deployer) is commonly used for Kyma deployments. The CDS build plugin produces the UI5 app in `gen/cap-js-data-inspector-ui` with the correct destination and `sap.cloud.service` already patched. You need to:

1. Run `cds build` to produce the patched UI5 app in `gen/cap-js-data-inspector-ui`.
2. Build the UI5 app for production: `cd gen/cap-js-data-inspector-ui && npm install && npm run build:cf`.
3. Include the resulting `dist/` contents (specifically `datainspectorapp.zip`) in your `html5-app-deployer` image alongside your other UI5 apps.

The exact steps depend on your deployment pipeline. Refer to the [SAP BTP documentation on HTML5 Application Deployer](https://help.sap.com/docs/btp/sap-business-technology-platform/deploy-content-using-html5-application-deployer) for details.

#### Custom Destination Name

The default OData route destination is `srv-api`. If your project uses a different destination name, the build plugin resolves it automatically in this order:

1. **Explicit configuration** — set `cds.data_inspector.destination` in your `.cdsrc.json` or `package.json`:

   ```json
   {
     "cds": {
       "data_inspector": {
         "destination": "my-custom-srv-api"
       }
     }
   }
   ```

2. **Auto-detection** — the plugin scans `app/*/xs-app.json` for an OData route and uses its destination value.

3. **Default** — falls back to `srv-api`.

#### sap.cloud.service Configuration

The `sap.cloud.service` property in `manifest.json` is required for SAP Build Work Zone to discover the app. The build plugin patches this value automatically when available:

1. **Explicit configuration** — set `cds.data_inspector.cloudService` in your `.cdsrc.json` or `package.json`:

   ```json
   {
     "cds": {
       "data_inspector": {
         "cloudService": "my.cloud.service"
       }
     }
   }
   ```

2. **Auto-detection** — the plugin scans `app/*/webapp/manifest.json` for an existing `sap.cloud.service` value and reuses it.

3. **Skipped** — if neither source provides a value, `sap.cloud.service` is not patched. You can always set it manually in the build output at `gen/cap-js-data-inspector-ui/webapp/manifest.json` before packaging, or add an explicit `cloudService` value as shown above.

#### Using Cloud Portal Service

The Cloud Portal Service uses a `CommonDataModel.json` file inside a `portal-site/` directory to define FLP catalog and group entries. The location of this file depends on the portal content deployer module defined in your `mta.yaml`.

The `cds add data-inspector` command detects the portal deployer path by inspecting `mta.yaml` for a `com.sap.application.content` module whose `requires` section targets a portal service resource (`service: portal`, `service-plan: standard`) with `content-target: true`. The module's `path` property determines where to find `portal-site/CommonDataModel.json`. For example, if the module's path is `flp`, the file is at `flp/portal-site/CommonDataModel.json`.

When detected, `cds add data-inspector` adds a **catalog** and **group** entry for the data-inspector tile to `CommonDataModel.json`. It also appends the group id `capDataInspectorGroupId` to the site's `groupsOrder` so the tile is visible by default in Fiori Launchpad — but only if exactly one `site` entity is found. If you have multiple sites, add the group id to `groupsOrder` in your preferred site manually.

To configure the data-inspector tile manually instead, add the following entries to your `CommonDataModel.json`:

**In `payload.catalogs[?].payload.viz`:**

```json
{
  "appId": "sap.cap.datainspector.datainspectorui",
  "vizId": "datainspectorui-display"
}
```

**In `payload.groups[?].payload.viz`:**

```json
{
  "id": "sap.cap.datainspector.datainspectorui",
  "appId": "sap.cap.datainspector.datainspectorui",
  "vizId": "datainspectorui-display"
}
```

Or add a new `catalog` and `group`. Example:

```json
{
  "payload": {
    "catalogs": [
      {
        "_version": "3.0.0",
        "identification": {
          "id": "capDataInspectorCatalogId",
          "title": "Data Inspector",
          "entityType": "catalog",
          "i18n": "..."
        },
        "payload": {
          "viz": [
            {
              "appId": "sap.cap.datainspector.datainspectorui",
              "vizId": "datainspectorui-display"
            }
          ]
        }
      }
    ],
    "groups": [
      {
        "_version": "3.0.0",
        "identification": {
          "id": "capDataInspectorGroupId",
          "title": "Data Inspector",
          "entityType": "group",
          "i18n": "..."
        },
        "payload": {
          "viz": [
            {
              "id": "sap.cap.datainspector.datainspectorui",
              "appId": "sap.cap.datainspector.datainspectorui",
              "vizId": "datainspectorui-display"
            }
          ]
        }
      }
    ]
  }
}
```

#### Using SAP Build Work Zone

SAP Build Work Zone (Standard Edition) provides a unified launchpad experience for enterprise applications. Integrating the data-inspector UI5 app with Workzone requires two configuration steps:

1. **MTA Configuration** — Handled automatically by `cds add data-inspector`
2. **CDM Content Configuration** — Requires manual setup (see below)

##### What `cds add data-inspector` Configures

When `mta.yaml` exists, the command configures:

- The `capjsdatainspectorapp` HTML5 module in `mta.yaml`
- The artifact reference in your HTML5 content deployer module

The `cdm.json` file is **not modified** because Workzone CDM content definitions reference project-specific entity IDs (roles, catalogs, spaces, workpages) that vary across implementations.

##### Prerequisites

Before the data-inspector tile can appear in SAP Build Work Zone:

| Requirement         | Configuration                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sap.cloud.service` | Set via `cds.data_inspector.cloudService` in `cds.env` or auto-detected from existing UI5 apps. See [sap.cloud.service Configuration](#sapcloudservice-configuration). |
| CDM content         | Add group, catalog, and role entries to your `cdm.json` (see below).                                                                                                   |

##### Manual CDM Configuration

Add a group entity to your `cdm.json` to display the data-inspector tile:

```json
{
  "_version": "3.0",
  "identification": {
    "id": "capDataInspectorGroupId",
    "title": "{{title}}",
    "entityType": "group"
  },
  "payload": {
    "viz": [
      {
        "id": "sap.cap.datainspector.datainspectorui",
        "appId": "sap.cap.datainspector.datainspectorui",
        "vizId": "datainspectorui-display"
      }
    ]
  },
  "texts": [
    { "locale": "", "textDictionary": { "title": "Data Inspector" } },
    { "locale": "en", "textDictionary": { "title": "Data Inspector" } }
  ]
}
```

Depending on your Workzone content model, you may also need to:

- Add the app to a **catalog** entity for discoverability
- Reference the catalog in a **role** entity to control access
- Include the group in a **space** or **workpage** for navigation

Refer to the [SAP Build Work Zone documentation](https://help.sap.com/docs/build-work-zone-standard-edition) for details on CDM content structure.

##### CDM Format Reference

| Aspect       | SAP Build Work Zone (`cdm.json`)      | Cloud Portal Service (`CommonDataModel.json`) |
| ------------ | ------------------------------------- | --------------------------------------------- |
| Structure    | JSON array of entities                | Object with `payload` wrapper                 |
| Localization | Inline `texts` array                  | External i18n `.properties` files             |
| Entity types | role, catalog, group, space, workpage | site, catalog, group                          |

### (Optional) flpSandbox.html Configuration for the UI5 App Tile for Local Testing

If you are using an `flpSandbox.html` to test locally, add the UI5 app tile in the sandbox Fiori Launchpad.

**In `ClientSideTargetResolution.adapter.config.inbounds`:**

```js
CAPDataInspectorDisplay: {
  semanticObject: "datainspectorui",
  action: "display",
  signature: {
    parameters: {},
    additionalParameters: "ignored"
  },
  resolutionResult: {
    additionalInformation: "sap.cap.datainspector.datainspectorui",
    applicationType: "URL",
    url: "/data-inspector-ui"
  }
}
```

**In `LaunchPage.adapter.config.groups`:**

```js
{
  id: "Supportability",
  title: "Support Tools",
  isPreset: true,
  isVisible: true,
  isGroupLocked: false,
  tiles: [
    {
      id: "CAPDataInspector",
      tileType: "sap.ushell.ui.tile.StaticTile",
      properties: {
        title: "Data Inspector",
        targetURL: "#datainspectorui-display",
        icon: "sap-icon://database"
      }
    }
  ]
}
```

### Authorization

Define and use the `xsuaa` scope `capDataInspectorReadonly` in your `xs-security.json` to grant read access to the UI5 app and the underlying OData service. For local development use case, add the scope `capDataInspectorReadonly` to your mock user. Refer [Capire documentation](https://cap.cloud.sap/docs/guides/security/authentication#mock-user-authentication) for setting up mock user.

`@cap-js/data-inspector` reads data only through the available CDS services, exposing data based on `xsuaa` scopes granted to the entities and the user. It does not implement own access control. It does not perform any direct SQL queries.

### Excluding Entities and Elements

To hide entities or elements from Data Inspector, annotate them with `@HideFromDataInspector` in your CDS definitions.

Example: Using `@HideFromDataInspector` annotation in the CDS entity definitions:

```cds
entity Foo {
    id   : String;
    name : String @HideFromDataInspector;
}
```

The element `name` of entity `Foo` will not be revealed by `@cap-js/data-inspector`.

```cds
@HideFromDataInspector
entity Bar {
    id   : String;
    name : String;
}
```

The entity `Bar` will not be revealed by `@cap-js/data-inspector`.

### Audit Logging

If your CAP application uses [`@cap-js/audit-logging`](https://github.com/cap-js/audit-logging#readme), `@cap-js/data-inspector` will automatically emit audit logs for read access to sensitive data elements annotated with `@PersonalData.IsPotentiallySensitive`. Refer [Capire](https://cap.cloud.sap/docs/guides/data-privacy/annotations) for audit logging in CAP.

## Testing the Plugin Directly

To quickly test the plugin directly without a host CAP Node.js project in your local machine, use the NPM test workspace included in this repository.

1. Clone the repository: `git clone https://github.com/cap-js/data-inspector.git`
2. Install dependencies: `npm i`
3. Generate CDS model types by saving any .cds file from VS Code. Refer [CDS Typer documentation](https://cap.cloud.sap/docs/tools/cds-typer) for more details.
4. Create the test sqlite db:
   1. `cd test`
   2. `cds deploy -2 sqlite:db/testservice.db`
   3. `cd ..`
5. Run the test server: `npm run dev` the UI5 app will be launched in a web browser
6. Supply credentials: Username: `alice`; Password: keep empty

## Support, Feedback, Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js/<your-project>/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Security / Disclosure

If you find any bug that may be a security problem, please follow our instructions at [in our security policy](https://github.com/cap-js/<your-project>/security/policy) on how to report it. Please do not create GitHub issues for security-related doubts or problems.

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](https://github.com/cap-js/.github/blob/main/CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2025 SAP SE or an SAP affiliate company and data-inspector contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js/<your-project>)




