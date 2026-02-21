/**
 * Tests for PortalServiceConfigurator
 * Tests Cloud Portal Service (FLP) integration configuration
 */
import { expect } from "chai";

import {
  TempUtil,
  createTestProject,
  runCdsAddDataInspector,
  readCommonDataModel,
  commonDataModelExists,
  readMta,
  i18nFileExists,
  readI18nFile,
  createMtaWithPortal,
  createMtaWithoutPortal,
  createMtaWithCustomDestination,
  createMtaWithDefaultDestination,
  createCommonDataModel,
  createHtml5AppWithDestination,
  createExistingI18nFile,
  createMtaWithContentModuleNoBuildParams,
  createMtaWithContentModuleNoRequires,
  createMtaWithNodejsProvides,
  createMtaWithMultipleContentModules,
  DATA_INSPECTOR_CATALOG_ID,
  DATA_INSPECTOR_GROUP_ID,
  DATA_INSPECTOR_MTA_MODULE_NAME,
  DATA_INSPECTOR_APP_ID,
} from "./helpers";

describe("PortalServiceConfigurator", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    await tempUtil.cleanUp();
  });

  describe("detection", () => {
    it("should not configure portal when mta.yaml does not exist", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true });

      // Create CommonDataModel.json without mta.yaml
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

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
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Add portal service to mta but don't create CommonDataModel.json
      createMtaWithPortal(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify CommonDataModel.json was not created
      expect(commonDataModelExists(project)).to.be.false;
    });

    it("should not configure portal when mta.yaml has no portal service", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create mta without portal service and CommonDataModel.json
      createMtaWithoutPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

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
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify catalog was added
      const cdm = readCommonDataModel(project);
      const catalog = cdm.payload.catalogs.find(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(catalog).to.exist;
      expect(catalog.identification.title).to.equal("{{capDataInspectorCatalog}}");
      expect(catalog.identification.i18n).to.equal("i18n/capDataInspector.properties");
      expect(catalog.payload.viz).to.have.lengthOf(1);
      expect(catalog.payload.viz[0].appId).to.equal(DATA_INSPECTOR_APP_ID);

      // Verify group was added
      const group = cdm.payload.groups.find(
        (g: any) => g.identification?.id === DATA_INSPECTOR_GROUP_ID
      );
      expect(group).to.exist;
      expect(group.identification.title).to.equal("{{capDataInspectorGroup}}");
      expect(group.payload.viz).to.have.lengthOf(1);
      expect(group.payload.viz[0].appId).to.equal(DATA_INSPECTOR_APP_ID);
    });

    it("should not duplicate catalog and group when run multiple times", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector twice
      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

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
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

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
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify i18n file was created
      expect(i18nFileExists(project)).to.be.true;

      // Verify i18n file content
      const i18nContent = readI18nFile(project);
      expect(i18nContent).to.include("capDataInspectorCatalog");
      expect(i18nContent).to.include("capDataInspectorGroup");
    });

    it("should not overwrite existing i18n file", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Create existing i18n file with custom content
      const customContent = "customProperty = Custom Value";
      createExistingI18nFile(project, customContent);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify i18n file was not overwritten
      const i18nContent = readI18nFile(project);
      expect(i18nContent).to.equal(customContent);
    });
  });

  describe("mta.yaml modification", () => {
    it("should add HTML5 module for data inspector", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify module was added
      const mta = readMta(project);
      const module = mta.modules.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(module).to.exist;
      expect(module.type).to.equal("html5");
      expect(module.path).to.equal("node_modules/@cap-js/data-inspector/app/data-inspector-ui");
      expect(module["build-parameters"]["build-result"]).to.equal("dist");
      expect(module["build-parameters"]["builder"]).to.equal("custom");
      // Commands always include npm install and build:cf (UI5 is built during MTA build)
      expect(module["build-parameters"]["commands"]).to.deep.equal([
        "npm install",
        "npm run build:cf",
      ]);
    });

    it("should add artifact to content module", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

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
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector twice
      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

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
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

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

  describe("destination configuration", () => {
    it("should not add patch command when using default srv-api destination", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration with default destination
      createMtaWithDefaultDestination(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify module was added with only build commands (no destination patch needed)
      const mta = readMta(project);
      const module = mta.modules.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(module).to.exist;
      // Only npm install and build commands, no destination patch
      expect(module["build-parameters"]["commands"]).to.deep.equal([
        "npm install",
        "npm run build:cf",
      ]);
    });

    it("should add patch command when using custom destination", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
      const customDestination = "poetry-slams-srv-api";

      // Create portal configuration with custom destination
      createMtaWithCustomDestination(project, customDestination);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify module was added with patch command before build commands
      const mta = readMta(project);
      const module = mta.modules.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(module).to.exist;
      const commands = module["build-parameters"]["commands"];
      // Patch command + npm install + npm run build:cf
      expect(commands).to.have.lengthOf(3);
      expect(commands[0]).to.include("xs-app.json");
      expect(commands[0]).to.include(customDestination);
      expect(commands[1]).to.equal("npm install");
      expect(commands[2]).to.equal("npm run build:cf");
    });

    it("should not duplicate patch command when run multiple times", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
      const customDestination = "my-custom-srv";

      // Create portal configuration with custom destination
      createMtaWithCustomDestination(project, customDestination);
      createCommonDataModel(project);

      // Run cds add data-inspector twice
      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

      // Verify patch command is not duplicated (still 3 commands total)
      const mta = readMta(project);
      const module = mta.modules.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(module).to.exist;
      const commands = module["build-parameters"]["commands"];
      // Should still be 3: patch + npm install + npm run build:cf
      expect(commands).to.have.lengthOf(3);
    });

    it("should detect destination from existing HTML5 app xs-app.json", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
      const customDestination = "bookshop-srv";

      // Create portal configuration without destinations in config
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Create an existing HTML5 app with custom destination in xs-app.json
      createHtml5AppWithDestination(project, customDestination);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify module was added with patch command for detected destination
      const mta = readMta(project);
      const module = mta.modules.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(module).to.exist;
      const commands = module["build-parameters"]["commands"];
      // Patch command + npm install + npm run build:cf
      expect(commands).to.have.lengthOf(3);
      expect(commands[0]).to.include(customDestination);
    });

    it("should detect destination from nodejs module provides section", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
      const customDestination = "my-srv-api";

      // Create portal configuration with destination in nodejs provides
      createMtaWithNodejsProvides(project, customDestination);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify module was added with patch command for detected destination
      const mta = readMta(project);
      const module = mta.modules.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(module).to.exist;
      const commands = module["build-parameters"]["commands"];
      // Patch command + npm install + npm run build:cf
      expect(commands).to.have.lengthOf(3);
      expect(commands[0]).to.include(customDestination);
    });
  });

  describe("edge cases", () => {
    it("should handle content module without build-parameters", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration with content module that has no build-parameters
      createMtaWithContentModuleNoBuildParams(project);
      createCommonDataModel(project);

      // Run cds add data-inspector - should not crash
      runCdsAddDataInspector(project);

      // Verify artifact was added (build-parameters and requires should be created)
      const mta = readMta(project);
      const contentModule = mta.modules.find(
        (m: any) => m.type === "com.sap.application.content" && m.path === "."
      );

      expect(contentModule).to.exist;
      expect(contentModule["build-parameters"]).to.exist;
      expect(contentModule["build-parameters"].requires).to.exist;

      const artifact = contentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(artifact).to.exist;
    });

    it("should handle content module without build-parameters.requires", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration with content module that has no requires array
      createMtaWithContentModuleNoRequires(project);
      createCommonDataModel(project);

      // Run cds add data-inspector - should not crash
      runCdsAddDataInspector(project);

      // Verify artifact was added (requires array should be created)
      const mta = readMta(project);
      const contentModule = mta.modules.find(
        (m: any) => m.type === "com.sap.application.content" && m.path === "."
      );

      expect(contentModule).to.exist;
      expect(contentModule["build-parameters"].requires).to.exist;

      const artifact = contentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(artifact).to.exist;
    });

    it("should handle multiple content modules by using first match", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration with multiple content modules
      createMtaWithMultipleContentModules(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify artifact was added to first content module
      const mta = readMta(project);

      // First content module should have the artifact
      const firstContentModule = mta.modules.find((m: any) => m.name === "first-content");
      expect(firstContentModule).to.exist;
      const artifactInFirst = firstContentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(artifactInFirst).to.exist;

      // Second content module should NOT have the artifact
      const secondContentModule = mta.modules.find((m: any) => m.name === "second-content");
      expect(secondContentModule).to.exist;
      const artifactInSecond = secondContentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(artifactInSecond).to.not.exist;
    });
  });
});
