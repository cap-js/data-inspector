/**
 * Tests for PortalServiceConfigurator.
 *
 * The configurator detects Cloud Portal Service integration by inspecting
 * mta.yaml for an FLP deployer module whose requires array targets a
 * portal service resource (service: portal, service-plan: standard) with
 * content-target: true.  The deployer module's "path" property gives the
 * base directory that contains portal-site/CommonDataModel.json.
 *
 * These tests verify:
 *   - Detection logic (mta.yaml + CommonDataModel.json must both exist)
 *   - CommonDataModel.json modification (catalog, group, groupsOrder)
 *   - i18n properties file creation
 *   - mta.yaml module and artifact addition
 *   - Dynamic path detection (the deployer path is NOT hard-coded)
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
  createCommonDataModel,
  createCommonDataModelWithSingleSite,
  createCommonDataModelWithMultipleSites,
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

  // -----------------------------------------------------------------------
  //  Detection
  // -----------------------------------------------------------------------

  describe("detection", () => {
    it("should not configure portal when mta.yaml does not exist", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true });

      // CommonDataModel.json alone is not enough — mta.yaml with a portal
      // deployer module is required for detection.
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
      const hasCatalog = cdm.payload.catalogs.some(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(hasCatalog).to.be.false;
    });

    it("should not configure portal when CommonDataModel.json does not exist", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // mta.yaml references the portal resource but CommonDataModel.json is missing.
      createMtaWithPortal(project, "flp");

      runCdsAddDataInspector(project);

      expect(commonDataModelExists(project, "flp")).to.be.false;
    });

    it("should not configure portal when mta.yaml has no portal service", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // mta.yaml has no portal resource → deployer path cannot be resolved.
      createMtaWithoutPortal(project);
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
      const hasCatalog = cdm.payload.catalogs.some(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(hasCatalog).to.be.false;
    });
  });

  // -----------------------------------------------------------------------
  //  Dynamic deployer path detection
  // -----------------------------------------------------------------------

  describe("deployer path detection from mta.yaml", () => {
    it("should detect portal-site under the default 'flp' path", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
      const catalog = cdm.payload.catalogs.find(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(catalog).to.exist;
    });

    it("should detect portal-site under a custom deployer path", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Use a non-default deployer path to verify dynamic detection.
      const customPath = "portal-content";
      createMtaWithPortal(project, customPath);
      createCommonDataModel(project, customPath);

      runCdsAddDataInspector(project);

      // Catalog and group should be added at the custom path.
      const cdm = readCommonDataModel(project, customPath);
      const catalog = cdm.payload.catalogs.find(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(catalog).to.exist;

      const group = cdm.payload.groups.find(
        (g: any) => g.identification?.id === DATA_INSPECTOR_GROUP_ID
      );
      expect(group).to.exist;

      // i18n file should also be created under the custom path.
      expect(i18nFileExists(project, customPath)).to.be.true;
    });
  });

  // -----------------------------------------------------------------------
  //  CommonDataModel.json modification
  // -----------------------------------------------------------------------

  describe("CommonDataModel.json modification", () => {
    it("should add catalog and group when portal service is configured", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");

      // Verify catalog
      const catalog = cdm.payload.catalogs.find(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(catalog).to.exist;
      expect(catalog.identification.title).to.equal("{{capDataInspectorCatalog}}");
      expect(catalog.identification.i18n).to.equal("i18n/capDataInspector.properties");
      expect(catalog.payload.viz).to.have.lengthOf(1);
      expect(catalog.payload.viz[0].appId).to.equal(DATA_INSPECTOR_APP_ID);

      // Verify group
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

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
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

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
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

  // -----------------------------------------------------------------------
  //  i18n properties file creation
  // -----------------------------------------------------------------------

  describe("i18n properties file creation", () => {
    it("should create i18n properties file when portal service is configured", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      expect(i18nFileExists(project, "flp")).to.be.true;

      const i18nContent = readI18nFile(project, "flp");
      expect(i18nContent).to.include("capDataInspectorCatalog");
      expect(i18nContent).to.include("capDataInspectorGroup");
    });
  });

  // -----------------------------------------------------------------------
  //  mta.yaml modification
  // -----------------------------------------------------------------------

  describe("mta.yaml modification", () => {
    it("should add HTML5 module for data inspector", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const mta = readMta(project);
      const module = mta.modules.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(module).to.exist;
      expect(module.type).to.equal("html5");
      expect(module.path).to.equal("gen/cap-js-data-inspector-ui");
      expect(module["build-parameters"]["build-result"]).to.equal("dist");
      expect(module["build-parameters"]["builder"]).to.equal("custom");
      expect(module["build-parameters"]["commands"]).to.deep.equal([
        "npm install",
        "npm run build:cf",
      ]);
    });

    it("should add artifact to content module", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

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

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

      const mta = readMta(project);
      const moduleCount = mta.modules.filter(
        (m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME
      ).length;
      expect(moduleCount).to.equal(1, "Module should not be duplicated");

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

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const mta = readMta(project);
      const existingModule = mta.modules.find((m: any) => m.name === "test-html5-app");
      expect(existingModule).to.exist;

      const contentModule = mta.modules.find(
        (m: any) => m.type === "com.sap.application.content" && m.path === "."
      );
      const existingArtifact = contentModule["build-parameters"].requires.find(
        (r: any) => r.name === "test-html5-app"
      );
      expect(existingArtifact).to.exist;
    });
  });

  // -----------------------------------------------------------------------
  //  Site groupsOrder configuration
  // -----------------------------------------------------------------------

  describe("CommonDataModel.json site groupsOrder configuration", () => {
    it("should add group to groupsOrder when there is exactly one site", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModelWithSingleSite(project, "flp");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
      const site = cdm.payload.sites[0];

      expect(site.payload.groupsOrder).to.include(DATA_INSPECTOR_GROUP_ID);
      expect(site.payload.groupsOrder).to.include("existingGroupId");
    });

    it("should not duplicate group in groupsOrder when run multiple times", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModelWithSingleSite(project, "flp");

      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
      const site = cdm.payload.sites[0];
      const groupCount = site.payload.groupsOrder.filter(
        (g: string) => g === DATA_INSPECTOR_GROUP_ID
      ).length;

      expect(groupCount).to.equal(1, "Group should not be duplicated in groupsOrder");
    });

    it("should not modify groupsOrder when there are multiple sites", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModelWithMultipleSites(project, "flp");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
      for (const site of cdm.payload.sites) {
        expect(site.payload.groupsOrder).to.not.include(DATA_INSPECTOR_GROUP_ID);
        expect(site.payload.groupsOrder).to.include("existingGroupId");
      }
    });

    it("should not add groupsOrder when there are no sites", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "flp");
      expect(cdm.payload.sites).to.have.lengthOf(0);
    });
  });

  // -----------------------------------------------------------------------
  //  Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("should handle content module without build-parameters", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithContentModuleNoBuildParams(project);
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

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

      createMtaWithContentModuleNoRequires(project);
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

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

      createMtaWithMultipleContentModules(project);
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      const mta = readMta(project);

      // First content module (targets html5-apps-repo) should get the artifact.
      const firstContentModule = mta.modules.find((m: any) => m.name === "first-content");
      expect(firstContentModule).to.exist;
      const requiredModuleInFirst = firstContentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(requiredModuleInFirst).to.exist;

      // Second content module should NOT get the artifact.
      const secondContentModule = mta.modules.find((m: any) => m.name === "second-content");
      expect(secondContentModule).to.exist;
      const requiredModuleInSecond = secondContentModule["build-parameters"].requires.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(requiredModuleInSecond).to.not.exist;
    });
  });
});
