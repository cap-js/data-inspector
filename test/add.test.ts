import { execSync } from "child_process";
import { join, resolve } from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { expect } from "chai";

const DATA_INSPECTOR_SCOPE = "$XSAPPNAME.capDataInspectorReadonly";
const DATA_INSPECTOR_CATALOG_ID = "capDataInspectorCatalogId";
const DATA_INSPECTOR_GROUP_ID = "capDataInspectorGroupId";
const DATA_INSPECTOR_MTA_MODULE_NAME = "capjsdatainspectorapp";

// Get the absolute path to the data-inspector gen directory (compiled output)
const DATA_INSPECTOR_ROOT = resolve(__dirname, "..", "gen");

/**
 * Simple TempUtil for creating temporary test projects
 */
class TempUtil {
  private rootTempFolder: string;

  constructor(fileName: string) {
    const random = crypto.randomBytes(2).toString("hex");
    this.rootTempFolder = join(os.tmpdir(), `${random}.tmp`);
  }

  async mkTempFolder(): Promise<string> {
    const random = crypto.randomBytes(4).toString("hex");
    const tempFolder = join(this.rootTempFolder, `test_${random}`);
    fs.mkdirSync(tempFolder, { recursive: true });
    return tempFolder;
  }

  async cleanUp(): Promise<void> {
    const cwd = process.cwd();
    if (cwd.startsWith(this.rootTempFolder)) {
      process.chdir(os.tmpdir());
    }
    if (fs.existsSync(this.rootTempFolder)) {
      fs.rmSync(this.rootTempFolder, { recursive: true, force: true });
    }
  }
}

/**
 * Updates package.json to add data-inspector as a local dependency
 */
function updateDependency(projectFolder: string): void {
  const packageJSONPath = join(projectFolder, "package.json");
  const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, "utf8"));
  // Use absolute path to data-inspector directory since temp folder is in a different location
  packageJSON.devDependencies = packageJSON.devDependencies || {};
  packageJSON.devDependencies["@cap-js/data-inspector"] = `file:${DATA_INSPECTOR_ROOT}`;
  fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 4));
}

/**
 * Hack to replace @sap/cds with @sap/cds-dk in the installed plugin files
 * This is required because cds.add is only available in @sap/cds-dk
 * Also fixes @sap/cds-foss import which is bundled with cds-dk
 */
function setupHack(projectFolder: string): void {
  const pluginDir = join(projectFolder, "node_modules/@cap-js/data-inspector");

  // Fix cds-plugin.js
  const cdsPluginPath = join(pluginDir, "cds-plugin.js");
  const cdsPlugin = fs.readFileSync(cdsPluginPath, "utf8");
  const updatedCdsPlugin = cdsPlugin.replace(/require\("@sap\/cds"\)/g, 'require("@sap/cds-dk")');
  fs.writeFileSync(cdsPluginPath, updatedCdsPlugin);

  // Fix lib/add.js - replace @sap/cds-dk require to ensure cds-foss is resolvable
  const addJsPath = join(pluginDir, "lib/add.js");
  if (fs.existsSync(addJsPath)) {
    const addJs = fs.readFileSync(addJsPath, "utf8");
    // Also replace @sap/cds references in add.js
    const updatedAddJs = addJs.replace(/require\("@sap\/cds"\)/g, 'require("@sap/cds-dk")');
    fs.writeFileSync(addJsPath, updatedAddJs);
  }
}

/**
 * Undo the hack to restore @sap/cds in the installed cds-plugin.js
 */
function undoSetupHack(projectFolder: string): void {
  const cdsPluginPath = join(projectFolder, "node_modules/@cap-js/data-inspector/cds-plugin.js");
  if (fs.existsSync(cdsPluginPath)) {
    const cdsPlugin = fs.readFileSync(cdsPluginPath, "utf8");
    // Replace back to cds
    const updatedData = cdsPlugin.replace(/require\("@sap\/cds-dk"\)/g, 'require("@sap/cds")');
    fs.writeFileSync(cdsPluginPath, updatedData);
  }
}

/**
 * Read and parse xs-security.json
 */
function readXsSecurity(projectFolder: string): any {
  const xsSecurityPath = join(projectFolder, "xs-security.json");
  return JSON.parse(fs.readFileSync(xsSecurityPath, "utf8"));
}

/**
 * Count occurrences of a scope in xs-security.json
 */
function countScope(xsSecurity: any, scopeName: string): number {
  if (!xsSecurity.scopes || !Array.isArray(xsSecurity.scopes)) {
    return 0;
  }
  return xsSecurity.scopes.filter((s: any) => s.name === scopeName).length;
}

describe("cds add data-inspector", () => {
  const tempUtil = new TempUtil(__filename);
  let temp: string;
  let bookshop: string;

  before(async () => {
    await tempUtil.cleanUp();
    temp = await tempUtil.mkTempFolder();
    bookshop = join(temp, "bookshop");

    // Initialize a CAP project with xsuaa
    execSync(`cds init bookshop --add xsuaa --nodejs`, { cwd: temp });

    // Update dependency to use local data-inspector
    updateDependency(bookshop);

    // Install dependencies
    execSync(`npm install`, { cwd: bookshop });

    // Apply hack to replace @sap/cds with @sap/cds-dk in node_modules
    setupHack(bookshop);
  });

  after(async () => {
    undoSetupHack(bookshop);
    await tempUtil.cleanUp();
  });

  it("should add data-inspector scope to xs-security.json", () => {
    // Verify xs-security.json exists and check initial state
    const initialXsSecurity = readXsSecurity(bookshop);
    const initialScopeCount = countScope(initialXsSecurity, DATA_INSPECTOR_SCOPE);
    expect(initialScopeCount).to.equal(0, "Scope should not exist initially");

    // Run cds add data-inspector
    execSync(`cds add data-inspector`, { cwd: bookshop });

    // Verify the scope was added
    const updatedXsSecurity = readXsSecurity(bookshop);
    const updatedScopeCount = countScope(updatedXsSecurity, DATA_INSPECTOR_SCOPE);
    expect(updatedScopeCount).to.equal(1, "Scope should be added exactly once");

    // Verify the scope has the correct description
    const scope = updatedXsSecurity.scopes.find((s: any) => s.name === DATA_INSPECTOR_SCOPE);
    expect(scope).to.exist;
    expect(scope.description).to.equal("Read access for @cap-js/data-inspector");
  });

  it("should not duplicate scope when run multiple times", () => {
    // Run cds add data-inspector again
    execSync(`cds add data-inspector`, { cwd: bookshop });

    // Verify the scope is still only present once
    const xsSecurity = readXsSecurity(bookshop);
    const scopeCount = countScope(xsSecurity, DATA_INSPECTOR_SCOPE);
    expect(scopeCount).to.equal(1, "Scope should not be duplicated");
  });

  it("should not modify existing scope with different description", async () => {
    // Create a new temp folder with xsuaa
    const tempExisting = await tempUtil.mkTempFolder();
    const projectExisting = join(tempExisting, "project");

    // Initialize a CAP project with xsuaa
    execSync(`cds init project --add xsuaa --nodejs`, { cwd: tempExisting });
    updateDependency(projectExisting);
    execSync(`npm install`, { cwd: projectExisting });
    setupHack(projectExisting);

    // Manually add the scope with a custom description
    const xsSecurityPath = join(projectExisting, "xs-security.json");
    const xsSecurity = JSON.parse(fs.readFileSync(xsSecurityPath, "utf8"));
    const customDescription = "Custom description for testing";
    xsSecurity.scopes = xsSecurity.scopes || [];
    xsSecurity.scopes.push({
      name: DATA_INSPECTOR_SCOPE,
      description: customDescription,
    });
    fs.writeFileSync(xsSecurityPath, JSON.stringify(xsSecurity, null, 2));

    // Run cds add data-inspector
    execSync(`cds add data-inspector`, { cwd: projectExisting });

    // Verify the scope was not duplicated and description was not changed
    const updatedXsSecurity = readXsSecurity(projectExisting);
    const scopeCount = countScope(updatedXsSecurity, DATA_INSPECTOR_SCOPE);
    expect(scopeCount).to.equal(1, "Scope should not be duplicated");

    const scope = updatedXsSecurity.scopes.find((s: any) => s.name === DATA_INSPECTOR_SCOPE);
    expect(scope).to.exist;
    expect(scope.description).to.equal(customDescription, "Description should not be changed");
  });

  it("should not add scope if xs-security.json does not exist", async () => {
    // Create a new temp folder without xsuaa
    const tempNoXsuaa = await tempUtil.mkTempFolder();
    const projectNoXsuaa = join(tempNoXsuaa, "project");

    // Initialize a CAP project without xsuaa
    execSync(`cds init project --nodejs`, { cwd: tempNoXsuaa });
    updateDependency(projectNoXsuaa);
    execSync(`npm install`, { cwd: projectNoXsuaa });

    // Apply hack for this project too
    setupHack(projectNoXsuaa);

    // Verify xs-security.json does not exist
    const xsSecurityPath = join(projectNoXsuaa, "xs-security.json");
    expect(fs.existsSync(xsSecurityPath)).to.be.false;

    // Run cds add data-inspector - should not throw
    execSync(`cds add data-inspector`, { cwd: projectNoXsuaa });

    // Verify xs-security.json still does not exist (plugin should not create it)
    expect(fs.existsSync(xsSecurityPath)).to.be.false;
  });
});

/**
 * Helper functions for portal service tests
 */

/**
 * Create a minimal mta.yaml with portal service
 */
function createMtaWithPortal(projectFolder: string): void {
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
function createMtaWithoutPortal(projectFolder: string): void {
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
 * Create a minimal CommonDataModel.json
 */
function createCommonDataModel(projectFolder: string): void {
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
      sites: [],
    },
  };
  const flpDir = join(projectFolder, "flp", "portal-site");
  fs.mkdirSync(flpDir, { recursive: true });
  fs.writeFileSync(join(flpDir, "CommonDataModel.json"), JSON.stringify(cdmContent, null, 4));
}

/**
 * Read and parse CommonDataModel.json
 */
function readCommonDataModel(projectFolder: string): any {
  const cdmPath = join(projectFolder, "flp", "portal-site", "CommonDataModel.json");
  return JSON.parse(fs.readFileSync(cdmPath, "utf8"));
}

/**
 * Read and parse mta.yaml
 */
function readMta(projectFolder: string): any {
  const mtaPath = join(projectFolder, "mta.yaml");
  // Using js-yaml which is available in @sap/cds-dk
  const yaml = require("@sap/cds-dk").utils.yaml;
  return yaml.load(fs.readFileSync(mtaPath, "utf8"));
}

/**
 * Check if i18n file exists
 */
function i18nFileExists(projectFolder: string): boolean {
  const i18nPath = join(projectFolder, "flp", "portal-site", "i18n", "capDataInspector.properties");
  return fs.existsSync(i18nPath);
}

/**
 * Read i18n properties file
 */
function readI18nFile(projectFolder: string): string {
  const i18nPath = join(projectFolder, "flp", "portal-site", "i18n", "capDataInspector.properties");
  return fs.readFileSync(i18nPath, "utf8");
}

describe("cds add data-inspector - Portal Service Configuration", () => {
  const tempUtil = new TempUtil(__filename);

  after(async () => {
    await tempUtil.cleanUp();
  });

  describe("Portal service detection", () => {
    it("should not configure portal when mta.yaml does not exist", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project without mta
      execSync(`cds init project --add xsuaa --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create CommonDataModel.json without mta.yaml
      createCommonDataModel(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify CommonDataModel.json was not modified (no catalog/group added)
      const cdm = readCommonDataModel(project);
      const hasCatalog = cdm.payload.catalogs.some(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      const hasGroup = cdm.payload.groups.some(
        (g: any) => g.identification?.id === DATA_INSPECTOR_GROUP_ID
      );

      expect(hasCatalog).to.be.false;
      expect(hasGroup).to.be.false;
    });

    it("should not configure portal when CommonDataModel.json does not exist", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project with mta
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Add portal service to mta but don't create CommonDataModel.json
      createMtaWithPortal(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify CommonDataModel.json was not created
      const cdmPath = join(project, "flp", "portal-site", "CommonDataModel.json");
      expect(fs.existsSync(cdmPath)).to.be.false;
    });

    it("should not configure portal when mta.yaml has no portal service", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create mta without portal service and CommonDataModel.json
      createMtaWithoutPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify CommonDataModel.json was not modified
      const cdm = readCommonDataModel(project);
      const hasCatalog = cdm.payload.catalogs.some(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(hasCatalog).to.be.false;
    });
  });

  describe("CommonDataModel.json modification", () => {
    it("should add catalog and group when portal service is configured", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify catalog was added
      const cdm = readCommonDataModel(project);
      const catalog = cdm.payload.catalogs.find(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(catalog).to.exist;
      expect(catalog.identification.title).to.equal("{{capDataInspectorCatalog}}");
      expect(catalog.identification.i18n).to.equal("i18n/capDataInspector.properties");
      expect(catalog.payload.viz).to.have.lengthOf(1);
      expect(catalog.payload.viz[0].appId).to.equal("sap.cap.datainspector.datainspectorui");

      // Verify group was added
      const group = cdm.payload.groups.find(
        (g: any) => g.identification?.id === DATA_INSPECTOR_GROUP_ID
      );
      expect(group).to.exist;
      expect(group.identification.title).to.equal("{{capDataInspectorGroup}}");
      expect(group.payload.viz).to.have.lengthOf(1);
      expect(group.payload.viz[0].appId).to.equal("sap.cap.datainspector.datainspectorui");
    });

    it("should not duplicate catalog and group when run multiple times", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector twice
      execSync(`cds add data-inspector`, { cwd: project });
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify catalog and group are not duplicated
      const cdm = readCommonDataModel(project);
      const catalogCount = cdm.payload.catalogs.filter(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      ).length;
      const groupCount = cdm.payload.groups.filter(
        (g: any) => g.identification?.id === DATA_INSPECTOR_GROUP_ID
      ).length;

      expect(catalogCount).to.equal(1, "Catalog should not be duplicated");
      expect(groupCount).to.equal(1, "Group should not be duplicated");
    });

    it("should preserve existing catalogs and groups", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify existing catalog and group are preserved
      const cdm = readCommonDataModel(project);
      const existingCatalog = cdm.payload.catalogs.find(
        (c: any) => c.identification?.id === "existingCatalogId"
      );
      const existingGroup = cdm.payload.groups.find(
        (g: any) => g.identification?.id === "existingGroupId"
      );

      expect(existingCatalog).to.exist;
      expect(existingGroup).to.exist;
    });
  });

  describe("i18n properties file creation", () => {
    it("should create i18n properties file when portal service is configured", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify i18n file was created
      expect(i18nFileExists(project)).to.be.true;

      // Verify i18n file content
      const i18nContent = readI18nFile(project);
      expect(i18nContent).to.include("capDataInspectorCatalog");
      expect(i18nContent).to.include("capDataInspectorGroup");
    });

    it("should not overwrite existing i18n file", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Create existing i18n file with custom content
      const i18nDir = join(project, "flp", "portal-site", "i18n");
      fs.mkdirSync(i18nDir, { recursive: true });
      const customContent = "customProperty = Custom Value";
      fs.writeFileSync(join(i18nDir, "capDataInspector.properties"), customContent);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify i18n file was not overwritten
      const i18nContent = readI18nFile(project);
      expect(i18nContent).to.equal(customContent);
    });
  });

  describe("mta.yaml modification", () => {
    it("should add HTML5 module for data inspector when portal service is configured", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify module was added
      const mta = readMta(project);
      const module = mta.modules.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(module).to.exist;
      expect(module.type).to.equal("html5");
      expect(module.path).to.equal("node_modules/@cap-js/data-inspector/app/data-inspector-ui");
      expect(module["build-parameters"]["build-result"]).to.equal("./");
      expect(module["build-parameters"]["builder"]).to.equal("custom");
      expect(module["build-parameters"]["commands"]).to.deep.equal([]);
    });

    it("should add artifact to content module when portal service is configured", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify artifact was added to content module
      const mta = readMta(project);
      const contentModule = mta.modules.find(
        (m: any) => m.type === "com.sap.application.content" && m.path === "."
      );

      expect(contentModule).to.exist;
      const artifact = contentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );

      expect(artifact).to.exist;
      expect(artifact.artifacts).to.deep.equal(["datainspectorapp.zip"]);
      expect(artifact["target-path"]).to.equal("resources/");
    });

    it("should not duplicate module and artifact when run multiple times", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector twice
      execSync(`cds add data-inspector`, { cwd: project });
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify module is not duplicated
      const mta = readMta(project);
      const moduleCount = mta.modules.filter(
        (m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME
      ).length;
      expect(moduleCount).to.equal(1, "Module should not be duplicated");

      // Verify artifact is not duplicated
      const contentModule = mta.modules.find(
        (m: any) => m.type === "com.sap.application.content" && m.path === "."
      );
      const artifactCount = contentModule["build-parameters"].requires.filter(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      ).length;
      expect(artifactCount).to.equal(1, "Artifact should not be duplicated");
    });

    it("should preserve existing modules and artifacts", async () => {
      const tempFolder = await tempUtil.mkTempFolder();
      const project = join(tempFolder, "project");

      // Initialize CAP project
      execSync(`cds init project --add xsuaa,mta --nodejs`, { cwd: tempFolder });
      updateDependency(project);
      execSync(`npm install`, { cwd: project });
      setupHack(project);

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      execSync(`cds add data-inspector`, { cwd: project });

      // Verify existing module is preserved
      const mta = readMta(project);
      const existingModule = mta.modules.find((m: any) => m.name === "test-html5-app");
      expect(existingModule).to.exist;

      // Verify existing artifact is preserved
      const contentModule = mta.modules.find(
        (m: any) => m.type === "com.sap.application.content" && m.path === "."
      );
      const existingArtifact = contentModule["build-parameters"].requires.find(
        (r: any) => r.name === "test-html5-app"
      );
      expect(existingArtifact).to.exist;
    });
  });
});
