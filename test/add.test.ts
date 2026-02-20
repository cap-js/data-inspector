/**
 * Tests for lib/add.ts - the main CDS Add Plugin
 * Tests the orchestration of configurators
 */
import { expect } from "chai";

import {
  TempUtil,
  createTestProject,
  runCdsAddDataInspector,
  readXsSecurity,
  readCommonDataModel,
  countScope,
  createMtaWithPortal,
  createCommonDataModel,
  DATA_INSPECTOR_SCOPE,
  DATA_INSPECTOR_CATALOG_ID,
  DATA_INSPECTOR_GROUP_ID,
} from "./helpers";

describe("cds add data-inspector", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    await tempUtil.cleanUp();
  });

  describe("orchestration", () => {
    it("should run all applicable configurators", async () => {
      // Create a project with both xsuaa and portal service
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
      createMtaWithPortal(project);
      createCommonDataModel(project);

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify XsSecurityConfigurator ran (scope added)
      const xsSecurity = readXsSecurity(project);
      const scopeCount = countScope(xsSecurity, DATA_INSPECTOR_SCOPE);
      expect(scopeCount).to.equal(1, "XsSecurityConfigurator should have added scope");

      // Verify PortalServiceConfigurator ran (catalog and group added)
      const cdm = readCommonDataModel(project);
      const hasCatalog = cdm.payload.catalogs.some(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      const hasGroup = cdm.payload.groups.some(
        (g: any) => g.identification?.id === DATA_INSPECTOR_GROUP_ID
      );
      expect(hasCatalog).to.be.true;
      expect(hasGroup).to.be.true;
    });

    it("should skip configurators when preconditions are not met", async () => {
      // Create a project with xsuaa but without portal service
      const project = await createTestProject(tempUtil, { xsuaa: true });
      createCommonDataModel(project); // CDM exists but no portal service in MTA

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify XsSecurityConfigurator ran
      const xsSecurity = readXsSecurity(project);
      const scopeCount = countScope(xsSecurity, DATA_INSPECTOR_SCOPE);
      expect(scopeCount).to.equal(1, "XsSecurityConfigurator should have run");

      // Verify PortalServiceConfigurator was skipped (no MTA file)
      const cdm = readCommonDataModel(project);
      const hasCatalog = cdm.payload.catalogs.some(
        (c: any) => c.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      expect(hasCatalog).to.be.false;
    });
  });
});