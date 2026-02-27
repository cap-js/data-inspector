/**
 * MTA YAML fixtures and generators for testing
 */
import fs from "fs";
import { join } from "path";

/**
 * Create a minimal mta.yaml with portal service
 */
export function createMtaWithPortal(projectFolder: string): void {
  const mtaContent = `_schema-version: "3.1"
ID: test-project
version: 1.0.0
modules:
  - name: test-html5-app
    type: html5
    path: app/test-app
    build-parameters:
      build-result: dist
      builder: custom
      commands: []
      supported-platforms: []
  - name: test-content
    type: com.sap.application.content
    path: .
    requires:
      - name: test-html5-repo-host
        parameters:
          content-target: true
    build-parameters:
      build-result: resources
      requires:
        - artifacts:
            - testapp.zip
          name: test-html5-app
          target-path: resources/
resources:
  - name: test-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host
  - name: test-portal
    type: org.cloudfoundry.managed-service
    parameters:
      service: portal
      service-plan: standard
`;
  fs.writeFileSync(join(projectFolder, "mta.yaml"), mtaContent);
}

/**
 * Create a minimal mta.yaml without portal service
 */
export function createMtaWithoutPortal(projectFolder: string): void {
  const mtaContent = `_schema-version: "3.1"
ID: test-project
version: 1.0.0
modules:
  - name: test-html5-app
    type: html5
    path: app/test-app
resources:
  - name: test-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host
`;
  fs.writeFileSync(join(projectFolder, "mta.yaml"), mtaContent);
}

/**
 * Create mta.yaml with custom destination in content module config
 */
export function createMtaWithCustomDestination(
  projectFolder: string,
  destinationName: string
): void {
  const mtaContent = `_schema-version: "3.1"
ID: test-project
version: 1.0.0
modules:
  - name: test-html5-app
    type: html5
    path: app/test-app
    build-parameters:
      build-result: dist
      builder: custom
      commands: []
      supported-platforms: []
  - name: test-content
    type: com.sap.application.content
    path: .
    requires:
      - name: ${destinationName}
      - name: test-html5-repo-host
        parameters:
          content-target: true
    parameters:
      config:
        destinations:
          - forwardAuthToken: true
            name: ${destinationName}
            url: ~{${destinationName}/srv-url}
    build-parameters:
      build-result: resources
      requires:
        - artifacts:
            - testapp.zip
          name: test-html5-app
          target-path: resources/
  - name: test-srv
    type: nodejs
    path: gen/srv
    provides:
      - name: ${destinationName}
        properties:
          srv-url: \${default-url}
resources:
  - name: test-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host
  - name: test-portal
    type: org.cloudfoundry.managed-service
    parameters:
      service: portal
      service-plan: standard
`;
  fs.writeFileSync(join(projectFolder, "mta.yaml"), mtaContent);
}

/**
 * Create mta.yaml with default srv-api destination
 */
export function createMtaWithDefaultDestination(projectFolder: string): void {
  createMtaWithCustomDestination(projectFolder, "srv-api");
}

/**
 * Create a minimal CommonDataModel.json (with no sites)
 */
export function createCommonDataModel(projectFolder: string): void {
  createCommonDataModelWithSites(projectFolder, 0);
}

/**
 * Create CommonDataModel.json with a single site
 */
export function createCommonDataModelWithSingleSite(projectFolder: string): void {
  createCommonDataModelWithSites(projectFolder, 1);
}

/**
 * Create CommonDataModel.json with multiple sites
 */
export function createCommonDataModelWithMultipleSites(projectFolder: string): void {
  createCommonDataModelWithSites(projectFolder, 2);
}

/**
 * Create CommonDataModel.json with specified number of sites
 */
function createCommonDataModelWithSites(projectFolder: string, siteCount: number): void {
  const sites = [];
  for (let i = 0; i < siteCount; i++) {
    sites.push({
      _version: "3.0.0",
      identification: {
        id: `site-${i + 1}-id`,
        entityType: "site",
        title: `Test Site ${i + 1}`,
      },
      payload: {
        groupsOrder: ["existingGroupId"],
      },
    });
  }

  const cdmContent = {
    _version: "3.0.0",
    identification: {
      id: "test-bundle-id",
      entityType: "bundle",
    },
    payload: {
      catalogs: [
        {
          _version: "3.0.0",
          identification: {
            id: "existingCatalogId",
            title: "{{existingTitle}}",
            entityType: "catalog",
            i18n: "i18n/existingCatalog.properties",
          },
          payload: {
            viz: [],
          },
        },
      ],
      groups: [
        {
          _version: "3.0.0",
          identification: {
            id: "existingGroupId",
            title: "{{existingGroup}}",
            entityType: "group",
            i18n: "i18n/existingGroup.properties",
          },
          payload: {
            viz: [],
          },
        },
      ],
      sites: sites,
    },
  };
  const flpDir = join(projectFolder, "flp", "portal-site");
  fs.mkdirSync(flpDir, { recursive: true });
  fs.writeFileSync(join(flpDir, "CommonDataModel.json"), JSON.stringify(cdmContent, null, 4));
}

/**
 * Create an existing HTML5 app with custom destination in xs-app.json
 */
export function createHtml5AppWithDestination(
  projectFolder: string,
  destinationName: string
): void {
  const appDir = join(projectFolder, "app", "test-app");
  fs.mkdirSync(appDir, { recursive: true });
  const xsAppContent = {
    authenticationMethod: "route",
    routes: [
      {
        source: "^/odata/v4/(.*)",
        target: "/odata/v4/$1",
        destination: destinationName,
        authenticationType: "xsuaa",
      },
      {
        source: "^(.*)$",
        target: "$1",
        service: "html5-apps-repo-rt",
        authenticationType: "xsuaa",
      },
    ],
  };
  fs.writeFileSync(join(appDir, "xs-app.json"), JSON.stringify(xsAppContent, null, 2));
}

/**
 * Create mta.yaml with content module that has no build-parameters
 */
export function createMtaWithContentModuleNoBuildParams(projectFolder: string): void {
  const mtaContent = `_schema-version: "3.1"
ID: test-project
version: 1.0.0
modules:
  - name: test-html5-app
    type: html5
    path: app/test-app
  - name: test-content
    type: com.sap.application.content
    path: .
    requires:
      - name: test-html5-repo-host
        parameters:
          content-target: true
resources:
  - name: test-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host
  - name: test-portal
    type: org.cloudfoundry.managed-service
    parameters:
      service: portal
      service-plan: standard
`;
  fs.writeFileSync(join(projectFolder, "mta.yaml"), mtaContent);
}

/**
 * Create mta.yaml with content module that has build-parameters but no requires
 */
export function createMtaWithContentModuleNoRequires(projectFolder: string): void {
  const mtaContent = `_schema-version: "3.1"
ID: test-project
version: 1.0.0
modules:
  - name: test-html5-app
    type: html5
    path: app/test-app
  - name: test-content
    type: com.sap.application.content
    path: .
    requires:
      - name: test-html5-repo-host
        parameters:
          content-target: true
    build-parameters:
      build-result: resources
resources:
  - name: test-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host
  - name: test-portal
    type: org.cloudfoundry.managed-service
    parameters:
      service: portal
      service-plan: standard
`;
  fs.writeFileSync(join(projectFolder, "mta.yaml"), mtaContent);
}

/**
 * Create mta.yaml with multiple content modules (edge case)
 */
export function createMtaWithMultipleContentModules(projectFolder: string): void {
  const mtaContent = `_schema-version: "3.1"
ID: test-project
version: 1.0.0
modules:
  - name: test-html5-app
    type: html5
    path: app/test-app
    build-parameters:
      build-result: dist
      builder: custom
      commands: []
      supported-platforms: []
  - name: first-content
    type: com.sap.application.content
    path: .
    requires:
      - name: test-html5-repo-host
        parameters:
          content-target: true
    build-parameters:
      build-result: resources
      requires:
        - artifacts:
            - testapp.zip
          name: test-html5-app
          target-path: resources/
  - name: second-content
    type: com.sap.application.content
    path: .
    build-parameters:
      build-result: resources
      requires:
        - artifacts:
            - otherapp.zip
          name: other-html5-app
          target-path: resources/
resources:
  - name: test-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host
  - name: test-portal
    type: org.cloudfoundry.managed-service
    parameters:
      service: portal
      service-plan: standard
`;
  fs.writeFileSync(join(projectFolder, "mta.yaml"), mtaContent);
}
