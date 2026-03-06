[![REUSE status](https://api.reuse.software/badge/github.com/cap-js/data-inspector)](https://api.reuse.software/info/github.com/cap-js/data-inspector)

# Data Inspector

- [Data Inspector](#data-inspector)
  - [About this project](#about-this-project)
    - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
    - [Installation](#installation)
    - [Setup with `cds add data-inspector`](#setup-with-cds-add-data-inspector)
    - [Authorization](#authorization)
    - [Excluding Entities and Elements](#excluding-entities-and-elements)
    - [Audit Logging](#audit-logging)
    - [UI5 App Deployment to BTP](#ui5-app-deployment-to-btp)
      - [CDS Build Plugin](#cds-build-plugin)
        - [Custom Destination Name](#custom-destination-name)
        - [sap.cloud.service Configuration](#sapcloudservice-configuration)
      - [MTA Deployment](#mta-deployment)
      - [@sap/html5-app-deployer](#saphtml5-app-deployer)
      - [Cloud Portal Service Configuration](#cloud-portal-service-configuration)
      - [SAP Build Work Zone Configuration](#sap-build-work-zone-configuration)
    - [(Optional) flpSandbox.html Configuration for the UI5 App Tile for Local Testing](#optional-flpsandboxhtml-configuration-for-the-ui5-app-tile-for-local-testing)
  - [Testing the Plugin Directly](#testing-the-plugin-directly)
  - [Support, Feedback, Contributing](#support-feedback-contributing)
  - [Security / Disclosure](#security--disclosure)
  - [Code of Conduct](#code-of-conduct)
  - [Licensing](#licensing)

## About this project

`@cap-js/data-inspector` is a CAP Node.js plugin to view data content of CDS [`Entities`](https://cap.cloud.sap/docs/cds/cdl#entity-definitions) defined in a CAP Node.js application. It comes with a UI5 app consumable out-of-the-box.

### Features

- Provided `xsuaa` scope for access control. See [Authorization](#authorization).
- Exclude specific entities and elements from being exposed by the plugin. See [Excluding Entities and Elements](#excluding-entities-and-elements).
- Automatically logs access to sensitive personal data using [`@cap-js/audit-logging`](https://github.com/cap-js/audit-logging#readme). See [Audit Logging](#audit-logging).

## Prerequisites

1. Ensure your project uses `@sap/cds` version 9.
2. Set up the `xsuaa` BTP service for authorization.
3. (Optional) Add [`@cap-js/audit-logging`](https://github.com/cap-js/audit-logging#readme) and the `auditlog` BTP service for audit logging.

## Setup

### Installation

_Internal npm registry detail to be added until publishing at npmjs.com_

Install the plugin in your CAP Node.js project.

```sh
npm install @cap-js/data-inspector
```

Running your CAP project locally with `cds serve` or `cds watch` will now serve the UI5 app on the `@sap/cds` web application endpoint `/data-inspector-ui`. Make sure to add neccessary authorizataion scope to your mock user. See [Authorization](#authorization).

### Setup with `cds add data-inspector`

Run `cds add data-inspector` to add `@cap-js/data-inspector` configuration to your project.

It makes the following changes:

- **XSUAA** (when `xs-security.json` exists): Adds the `xsuaa` scope `capDataInspectorReadonly` to your `xs-security.json`. Make sure to use this scope in appropriate role collections. See [Authorization](#authorization).
- **MTA** (when `mta.yaml` exists): Adds the data-inspector HTML5 module and artifact to your `mta.yaml`. See [MTA Deployment](#mta-deployment).
  - Adds `html5` module `capjsdatainspectorapp` pointing to the UI5 app in `gen/cap-js-data-inspector-ui`.
  - Adds the `capjsdatainspectorapp` artifact to the HTML5 content module (the `com.sap.application.content` module that targets your `html5-apps-repo` `app-host` resource).
- **Cloud Portal Service** (when detected in `mta.yaml` and a `portal-site/CommonDataModel.json` exists): Adds `catalog` and `group` configuration for the data-inspector tile to your `CommonDataModel.json`, and creates an i18n properties file for translatable titles. See [Cloud Portal Service Configuration](#cloud-portal-service-configuration).

### Authorization

Define and use the `xsuaa` scope `capDataInspectorReadonly` in your `xs-security.json` to grant read access to the plugin's UI5 app and the underlying OData service. For local development and testing, add the scope `capDataInspectorReadonly` to your mock user. Refer [Capire documentation](https://cap.cloud.sap/docs/guides/security/authentication#mock-user-authentication) for setting up mock user.

Note: `@cap-js/data-inspector` reads data only through the available CDS services, exposing data based on `xsuaa` scopes granted to the entities and the user. It does not implement own access control. It does not perform any direct SQL queries.

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

### UI5 App Deployment to BTP

#### CDS Build Plugin

`@cap-js/data-inspector` ships a CDS build plugin that runs during your `cds build`. The plugin:

1. **Copies** the UI5 app source from the plugin package into `gen/cap-js-data-inspector-ui`.
2. **Patches the UI5 app's `xs-app.json`** with your Node.js OData server destination name (auto-detected from your project or configurable via `cds.env`). See [Custom Destination Name](#custom-destination-name).
3. **Patches the UI5 app's `manifest.json`** with `sap.cloud.service` when a value is available from `cds.env` or auto-detected from an existing UI5 app in the project. See [sap.cloud.service Configuration](#sapcloudservice-configuration).

The resulting `gen/cap-js-data-inspector-ui` folder is the single source of truth for deployment, whether you use [MTA-based deployment](#mta-deployment) or [`@sap/html5-app-deployer`](#saphtml5-app-deployer).

##### Custom Destination Name

The default OData route destination is `srv-api`. If your project uses a different destination name, the build plugin resolves it automatically in this order:

1. **Explicit configuration** — set `cds.data-inspector.destination` in your `.cdsrc.json` or `package.json`:

   ```json
   {
     "cds": {
       "data-inspector": {
         "destination": "my-custom-srv-api"
       }
     }
   }
   ```

2. **Auto-detection** — the plugin scans your existing `app/*/xs-app.json` for an OData route and uses its destination value.

3. **Default** — falls back to `srv-api`.

##### sap.cloud.service Configuration

The `sap.cloud.service` property in the UI5 app's `manifest.json` is required for SAP Build Work Zone. The [`cds build`](#cds-build-plugin) plugin patches this value automatically when available:

1. **Explicit configuration** — set `cds.data-inspector.cloudService` in your `.cdsrc.json` or `package.json`:

   ```json
   {
     "cds": {
       "data-inspector": {
         "cloudService": "my.cloud.service"
       }
     }
   }
   ```

2. **Auto-detection** — the plugin scans your existing `app/*/webapp/manifest.json` for an existing `sap.cloud.service` value and uses it.

3. **Skipped** — if neither source provides a value, `sap.cloud.service` is not added in the UI5 app's manifest.json.

#### MTA Deployment

The UI5 app produced by [`cds build`](#cds-build-plugin) in `gen/cap-js-data-inspector-ui` must be referenced by an `html5` module in your `mta.yaml` and included in the HTML5 content module for deployment to the `HTML5 Application Repository` service. Running `cds add data-inspector` configures this automatically.

1. Add an `html5` module as follows.

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

1. Include the `html5` module in your HTML5 content module — the `com.sap.application.content` module that targets your `html5-apps-repo` `app-host` resource. For example:

```yaml
- name: <your app content module name>
  type: com.sap.application.content
  path: <your app content module path>
  requires:
    - name: <your html5-apps-repo app-host resource name>
      parameters:
        content-target: true
  build-parameters:
    build-result: <your module build output path>
    requires:
      - name: capjsdatainspectorapp
        artifacts:
          - datainspectorapp.zip
        target-path: <your html5 app artifact build output path>
```

#### @sap/html5-app-deployer

For deployment with [`@sap/html5-app-deployer`](https://www.npmjs.com/package/@sap/html5-app-deployer), use the source of the UI5 app produced by [`cds build`](#cds-build-plugin) in `gen/cap-js-data-inspector-ui` to include it when creating your `html5-app-deployer` image.

1. Run `cds build` to produce the patched UI5 app in `gen/cap-js-data-inspector-ui`.
2. Build the UI5 app for production: `cd gen/cap-js-data-inspector-ui && npm install && npm run build:cf`.
3. Include the resulting `dist/` contents (specifically `datainspectorapp.zip`) in your `html5-app-deployer` image alongside your other UI5 apps.

The exact steps depend on your deployment pipeline. Refer to the [SAP BTP documentation on HTML5 Application Deployer](https://help.sap.com/docs/btp/sap-business-technology-platform/deploy-content-using-html5-application-deployer) for details.

#### Cloud Portal Service Configuration

When Cloud Portal service is detected in your `mta.yaml` (`service: portal`, `service-plan: standard`), `cds add data-inspector` will:

- Add a **catalog** and **group** entry for the data-inspector tile to `portal-site/CommonDataModel.json`.
- Create an **i18n properties file** with translatable titles for the catalog and group entries.
- Append the group id `capDataInspectorGroupId` to the site's `groupsOrder` so the tile is visible by default in Fiori Launchpad — but only if exactly one `site` entity is found. If you have multiple sites, add the group id to `groupsOrder` in your preferred site manually.

To configure the data-inspector tile manually, add the following entries to your `CommonDataModel.json`:

**In `payload.catalogs[*].payload.viz`:**

```json
{
  "appId": "sap.cap.datainspector.datainspectorui",
  "vizId": "datainspectorui-display"
}
```

**In `payload.groups[*].payload.viz`:**

```json
{
  "id": "sap.cap.datainspector.datainspectorui",
  "appId": "sap.cap.datainspector.datainspectorui",
  "vizId": "datainspectorui-display"
}
```

Or add a new `catalog` and `group`. For example:

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
          "i18n": "your_i18n_file_path"
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
          "i18n": "your_i18n_file_path"
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

#### SAP Build Work Zone Configuration

If you use **SAP Build Work Zone**, the Workzone CDM configuration (`cdm.json`) must be edited manually to add the UI5 app. The `sap.cloud.service` value in the `manifest.json` of the UI5 app should already be [patched by the `cds build` plugin](#sapcloudservice-configuration) to work with **SAP Build Work Zone**.

Depending on your Workzone content model, you may need to:

- Add the app to a **catalog** entity for discoverability
- Reference the catalog in a **role** entity to control access
- Include the group in a **space** or **workpage** for navigation

Ensure the following values of `appId` and `vizId` for the UI5 app in your `cdm.json`.

```json
"viz": {
  "appId": "sap.cap.datainspector.datainspectorui",
  "vizId": "datainspectorui-display"
}
```

Refer to the [SAP Build Work Zone documentation](https://help.sap.com/docs/build-work-zone-standard-edition) for details on CDM content structure.

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
