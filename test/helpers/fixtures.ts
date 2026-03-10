/**
 * Provides factory functions that create mta.yaml, CommonDataModel.json,
 * cdm.json, and other project artefacts inside a temporary test project.
 */
import fs from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
//  MTA fixtures
// ---------------------------------------------------------------------------

/**
 * Create mta.yaml with a portal service resource and an FLP deployer module.
 *
 * The deployer module (type: com.sap.application.content) points to
 * {@link deployerPath} and requires the portal resource with
 * content-target: true.  PortalServiceConfigurator reads the module's
 * "path" to locate portal-site/CommonDataModel.json.
 *
 * @param deployerPath  Module path written into mta.yaml (e.g. "flp")
 */
export function createMtaWithPortal(projectFolder: string, deployerPath: string): void {
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
          target-path: ui5-resources/
  - name: test-flp-deployer
    type: com.sap.application.content
    path: ${deployerPath}
    requires:
      - name: test-portal
        parameters:
          content-target: true
      - name: test-html5-repo-host
      - name: test-content
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
 * Create a minimal mta.yaml with SAP Build Workzone service
 * and a custom target-path to verify dynamic resolution.
 */
export function createMtaWithWorkzone(projectFolder: string): void {
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
          target-path: app-content/
resources:
  - name: test-html5-repo-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host
  - name: test-workzone
    type: org.cloudfoundry.managed-service
    parameters:
      service: build-workzone-standard
      service-plan: local-entry-point
`;
  fs.writeFileSync(join(projectFolder, "mta.yaml"), mtaContent);
}

/**
 * Create a minimal mta.yaml
 */
export function createMta(projectFolder: string): void {
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

// ---------------------------------------------------------------------------
//  MTA edge-case fixtures
// ---------------------------------------------------------------------------

/**
 * Create mta.yaml with portal service and content module that has no build-parameters
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
  - name: test-flp-deployer
    type: com.sap.application.content
    path: flp
    requires:
      - name: test-portal
        parameters:
          content-target: true
      - name: test-html5-repo-host
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
 * Create mta.yaml with portal service and content module that has
 * build-parameters but no requires array
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
  - name: test-flp-deployer
    type: com.sap.application.content
    path: flp
    requires:
      - name: test-portal
        parameters:
          content-target: true
      - name: test-html5-repo-host
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
 * Create mta.yaml with portal service and multiple content modules (edge case)
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
  - name: test-flp-deployer
    type: com.sap.application.content
    path: flp
    requires:
      - name: test-portal
        parameters:
          content-target: true
      - name: test-html5-repo-host
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

// ---------------------------------------------------------------------------
//  CommonDataModel.json fixtures  (for Portal Service)
// ---------------------------------------------------------------------------

/**
 * Create a minimal CommonDataModel.json (with no sites).
 * @param deployerPath  Must match the deployer module path in mta.yaml
 */
export function createCommonDataModel(projectFolder: string, deployerPath: string): void {
  createCommonDataModelWithSites(projectFolder, 0, deployerPath);
}

/**
 * Create CommonDataModel.json with a single site.
 * @param deployerPath  Must match the deployer module path in mta.yaml
 */
export function createCommonDataModelWithSingleSite(
  projectFolder: string,
  deployerPath: string
): void {
  createCommonDataModelWithSites(projectFolder, 1, deployerPath);
}

/**
 * Create CommonDataModel.json with multiple sites.
 * @param deployerPath  Must match the deployer module path in mta.yaml
 */
export function createCommonDataModelWithMultipleSites(
  projectFolder: string,
  deployerPath: string
): void {
  createCommonDataModelWithSites(projectFolder, 2, deployerPath);
}

/**
 * Create CommonDataModel.json with the specified number of sites.
 * Placed under {deployerPath}/portal-site/ to match the FLP deployer module path.
 */
function createCommonDataModelWithSites(
  projectFolder: string,
  siteCount: number,
  deployerPath: string
): void {
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
  const portalSiteDir = join(projectFolder, deployerPath, "portal-site");
  fs.mkdirSync(portalSiteDir, { recursive: true });
  fs.writeFileSync(
    join(portalSiteDir, "CommonDataModel.json"),
    JSON.stringify(cdmContent, null, 4)
  );
}

// ---------------------------------------------------------------------------
//  Existing HTML5 app fixtures
// ---------------------------------------------------------------------------

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
 * Create an existing HTML5 app with sap.cloud.service in its manifest.json.
 * Used to test auto-detection of cloudService by the CDS build plugin.
 */
export function createHtml5AppWithCloudService(
  projectFolder: string,
  cloudServiceValue: string
): void {
  const webappDir = join(projectFolder, "app", "test-app", "webapp");
  fs.mkdirSync(webappDir, { recursive: true });
  const manifestContent = {
    "sap.app": {
      id: "test.app",
      type: "application",
    },
    "sap.cloud": {
      public: true,
      service: cloudServiceValue,
    },
  };
  fs.writeFileSync(join(webappDir, "manifest.json"), JSON.stringify(manifestContent, null, 2));
}
