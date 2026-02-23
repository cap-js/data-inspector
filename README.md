[![REUSE status](https://api.reuse.software/badge/github.com/cap-js/data-inspector)](https://api.reuse.software/info/github.com/cap-js/data-inspector)

# Data Inspector

- [Data Inspector](#data-inspector)
  - [About this project](#about-this-project)
    - [Features](#features)
  - [Requirements and Setup](#requirements-and-setup)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Setup with `cds add data-inspector`](#setup-with-cds-add-data-inspector)
    - [UI5 App Configuration for Deployment to BTP](#ui5-app-configuration-for-deployment-to-btp)
      - [MTA Configuration](#mta-configuration)
        - [1. Add `html5` module](#1-add-html5-module)
        - [2. Include UI5 App Artifact](#2-include-ui5-app-artifact)
      - [Using Cloud Portal Service](#using-cloud-portal-service)
      - [Using SAP Build Work Zone](#using-sap-build-work-zone)
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

*Internal npm registry detail to be added until publishing at npmjs.com*

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
- **MTA configuration**: Adds the following configuration to your `mta.yaml`. Also see [MTA Configuration](#mta-configuration).
  - Adds `html5` module `capjsdatainspectorapp` of the UI5 app.
  - Adds the `capjsdatainspectorapp` artifact to your FLP application content module (where `type = com.sap.application.content and path = "."`). 
- **Cloud Portal service**: Adds `catalog` and `group` configuration for the UI5 app to your `flp/portal-site/CommonDataModel.json`. Also see [Using Cloud Portal Service](#using-cloud-portal-service).

### UI5 App Configuration for Deployment to BTP

#### MTA Configuration

`@cap-js/data-inspector` comes with the source of its UI5 app which can be found at `node_modules/@cap-js/data-inspector/app/data-inspector-ui`. Just like any UI5 app built natively in your CAP application, `@cap-js/data-inspector`'s UI5 app must be built during your MTA build and included in your FLP application content module for deployment to the `HTML5 Application Repository` service.

##### 1. Add `html5` module

Add the `html5` module of the UI5 app as follows.

```yaml
  - name: capjsdatainspectorapp
    type: html5
    path: node_modules/@cap-js/data-inspector/app/data-inspector-ui
    build-parameters:
      build-result: dist
      builder: custom
      commands:
        - npm install
        - npm run build:cf
      supported-platforms:
        []
```

If the destination name of your CAP backend service is not the conventional `srv-api`, the approuter configuration `xs-app.json` of the UI5 app must be patched with your specific destination name. To do so, add the following script in the build command and provide your destination name to `DESTINATION_NAME`.

```yaml
- >-
  node -e "
  const DESTINATION_NAME = 'your destination name';
  const fs = require('fs');
  const xs = JSON.parse(fs.readFileSync('xs-app.json'));
  xs.routes.find(r => r.destination).destination = DESTINATION_NAME;
  fs.writeFileSync('xs-app.json', JSON.stringify(xs, null, 2));
  "
```

Your `html5` module now looks like as follows, if your destination name is `foo-srv-api`.

```yaml
- name: capjsdatainspectorapp
  type: html5
  path: node_modules/@cap-js/data-inspector/app/data-inspector-ui
  build-parameters:
    build-result: dist
    builder: custom
    commands:
      - >-
        node -e "
        const DESTINATION_NAME = 'foo-srv-api';
        const fs = require('fs');
        const xs = JSON.parse(fs.readFileSync('xs-app.json'));
        xs.routes.find(r => r.destination).destination = DESTINATION_NAME;
        fs.writeFileSync('xs-app.json', JSON.stringify(xs, null, 2));
        "
      - npm install
      - npm run build:cf
    supported-platforms:
      []
```

Note: Running `cds add data-inspector` will automatically detect your destination name and add the above patch script. Make sure to review the destination name and amend as necessary.

##### 2. Include UI5 App Artifact

Include the UI5 app artifact from the above `html5` module [capjsdatainspectorapp](#1-add-html5-module) in your FLP application content module as follows.

```yaml
- name: <your app content module name>
  type: com.sap.application.content
  path: .
  build-parameters:
    build-result: resources
    requires:
      - name: capjsdatainspectorapp
          artifacts:
            - datainspectorapp.zip
          target-path: resources/
```

#### Using Cloud Portal Service

In your `flp/portal-site/CommonDataModel.json` add the following entries to an existing `catalog` and `group` configurations of your choice.

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

Or add a `catalog` and `group` separately. Example:

```json
{
  "payload": {
    "catalogs": [
      {
        ...
      },
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
        ...
      },
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

Note: Running `cds add data-inspector` will add a new `catalog` and `group` if your project is detected to be using Cloud Portal service.

#### Using SAP Build Work Zone

*To be added*


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

<!-- ### Local Testing

To execute local tests, simply run:

```bash
npm run test
```

For tests, the `cds-test` Plugin is used to spin up the application. More information about `cds-test` can be found [here](https://cap.cloud.sap/docs/node.js/cds-test).

### Hybrid Testing

#### Local

In the case of hybrid tests (i.e., tests that run with a real BTP service), you can bind the service instance to the local application like this:

```bash
cds bind -2 my-service
```

More on `cds bind` can be found [here](https://pages.github.tools.sap/cap/docs/advanced/hybrid-testing#cds-bind-usage)

The hybrid integration tests can be run via:

```bash
npm run test:hybrid
```

#### CI

For CI, the service binding is added during the action run. Uncomment the _Bind against BTP services_ and _BTP Auth_ sections in the file `.github/actions/integration-tests/action.yml` and adjust the service name/names accordingly. The `cds bind` command executed there will be the almost the same as done locally before, with the difference that it will be written to package.json in CI.

You can also execute the tests against a HANA Cloud instance. For that, add the commented sections in the action file and adjust accordingly. -->

## Support, Feedback, Contributing

This project is open to feature requests/suggestions, bug reports etc. via [GitHub issues](https://github.com/cap-js/<your-project>/issues). Contribution and feedback are encouraged and always welcome. For more information about how to contribute, the project structure, as well as additional contribution information, see our [Contribution Guidelines](CONTRIBUTING.md).

## Security / Disclosure

If you find any bug that may be a security problem, please follow our instructions at [in our security policy](https://github.com/cap-js/<your-project>/security/policy) on how to report it. Please do not create GitHub issues for security-related doubts or problems.

## Code of Conduct

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone. By participating in this project, you agree to abide by its [Code of Conduct](https://github.com/cap-js/.github/blob/main/CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright 2025 SAP SE or an SAP affiliate company and data-inspector contributors. Please see our [LICENSE](LICENSE) for copyright and license information. Detailed information including third-party components and their licensing/copyright information is available [via the REUSE tool](https://api.reuse.software/info/github.com/cap-js/<your-project>).
