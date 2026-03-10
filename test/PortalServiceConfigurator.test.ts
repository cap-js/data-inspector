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
 *   - Dynamic path detection (the deployer path is NOT hard-coded)
 *
 * Note: mta.yaml module/artifact addition is tested in MtaConfigurator.test.ts.
 */
import { expect } from "chai";
import fs from "fs";
import { join } from "path";

import {
  TempUtil,
  createTestProject,
  runCdsAddDataInspector,
  createMtaWithPortal,
  createMta,
  createCommonDataModel,
  createCommonDataModelWithSingleSite,
  createCommonDataModelWithMultipleSites,
  DATA_INSPECTOR_CATALOG_ID,
  DATA_INSPECTOR_GROUP_ID,
  DATA_INSPECTOR_APP_ID,
} from "./helpers";

/** Read and parse CommonDataModel.json from {deployerPath}/portal-site/ */
function readCommonDataModel(projectFolder: string, deployerPath: string): any {
  const cdmPath = join(projectFolder, deployerPath, "portal-site", "CommonDataModel.json");
  return JSON.parse(fs.readFileSync(cdmPath, "utf8"));
}

/** Check if CommonDataModel.json exists under {deployerPath}/portal-site/ */
function commonDataModelExists(projectFolder: string, deployerPath: string): boolean {
  const cdmPath = join(projectFolder, deployerPath, "portal-site", "CommonDataModel.json");
  return fs.existsSync(cdmPath);
}

/** Check if i18n file exists under {deployerPath}/portal-site/ */
function i18nFileExists(projectFolder: string, deployerPath: string): boolean {
  const i18nPath = join(
    projectFolder,
    deployerPath,
    "portal-site",
    "i18n",
    "capDataInspector.properties"
  );
  return fs.existsSync(i18nPath);
}

/** Read i18n properties file from {deployerPath}/portal-site/ */
function readI18nFile(projectFolder: string, deployerPath: string): string {
  const i18nPath = join(
    projectFolder,
    deployerPath,
    "portal-site",
    "i18n",
    "capDataInspector.properties"
  );
  return fs.readFileSync(i18nPath, "utf8");
}

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
      createMta(project);
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
  //  CommonDataModel.json modification
  // -----------------------------------------------------------------------

  describe("CommonDataModel.json modification", () => {
    it("should add catalog and group when portal service is configured", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithPortal(project, "random-path");
      createCommonDataModel(project, "random-path");

      runCdsAddDataInspector(project);

      const cdm = readCommonDataModel(project, "random-path");

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

      // Verify i18n file creation
      expect(i18nFileExists(project, "random-path")).to.be.true;

      // Verify existing catalogs and groups are preserved
      const i18nContent = readI18nFile(project, "random-path");
      expect(i18nContent).to.include("capDataInspectorCatalog");
      expect(i18nContent).to.include("capDataInspectorGroup");

      const existingCatalog = cdm.payload.catalogs.find(
        (c: any) => c.identification?.id === "existingCatalogId"
      );
      const existingGroup = cdm.payload.groups.find(
        (g: any) => g.identification?.id === "existingGroupId"
      );

      expect(existingCatalog).to.exist;
      expect(existingGroup).to.exist;
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
});
