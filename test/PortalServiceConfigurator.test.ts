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
  createCommonDataModelWithSingleSite,
  createCommonDataModelWithMultipleSites,
  createHtml5AppWithDestination,
  createMtaWithContentModuleNoBuildParams,
  createMtaWithContentModuleNoRequires,
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
      expect(module.path).to.equal("gen/cap-js-data-inspector-ui");
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

  describe("CommonDataModel.json site groupsOrder configuration", () => {
    it("should add group to groupsOrder when there is exactly one site", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration with single site
      createMtaWithPortal(project);
      createCommonDataModelWithSingleSite(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify group was added to groupsOrder
      const cdm = readCommonDataModel(project);
      const site = cdm.payload.sites[0];

      expect(site.payload.groupsOrder).to.include(DATA_INSPECTOR_GROUP_ID);
      // Existing group should still be there
      expect(site.payload.groupsOrder).to.include("existingGroupId");
    });

    it("should not duplicate group in groupsOrder when run multiple times", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration with single site
      createMtaWithPortal(project);
      createCommonDataModelWithSingleSite(project);

      // Run cds add data-inspector twice
      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

      // Verify group is not duplicated
      const cdm = readCommonDataModel(project);
      const site = cdm.payload.sites[0];
      const groupCount = site.payload.groupsOrder.filter(
        (g: string) => g === DATA_INSPECTOR_GROUP_ID
      ).length;

      expect(groupCount).to.equal(1, "Group should not be duplicated in groupsOrder");
    });

    it("should not modify groupsOrder when there are multiple sites", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration with multiple sites
      createMtaWithPortal(project);
      createCommonDataModelWithMultipleSites(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify no site's groupsOrder was modified (should only have existing group)
      const cdm = readCommonDataModel(project);
      for (const site of cdm.payload.sites) {
        expect(site.payload.groupsOrder).to.not.include(DATA_INSPECTOR_GROUP_ID);
        expect(site.payload.groupsOrder).to.include("existingGroupId");
      }
    });

    it("should not add groupsOrder when there are no sites", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Create portal configuration with no sites
      createMtaWithPortal(project);
      createCommonDataModel(project); // Creates CommonDataModel with empty sites array

      // Run cds add data-inspector - should not crash
      runCdsAddDataInspector(project);

      // Verify sites array is still empty (or unchanged)
      const cdm = readCommonDataModel(project);
      expect(cdm.payload.sites).to.have.lengthOf(0);
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

      const requiredModule = contentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(requiredModule).to.exist;
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

      const requiredModule = contentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(requiredModule).to.exist;
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

      // First content module should require the html5 module
      const firstContentModule = mta.modules.find((m: any) => m.name === "first-content");
      expect(firstContentModule).to.exist;
      const requiredModuleInFirst = firstContentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(requiredModuleInFirst).to.exist;

      // Second content module should NOT require the html5 module
      const secondContentModule = mta.modules.find((m: any) => m.name === "second-content");
      expect(secondContentModule).to.exist;
      const requiredModuleInSecond = secondContentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(requiredModuleInSecond).to.not.exist;
    });
  });
});
