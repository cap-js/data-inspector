/**
 * Tests for lib/add.ts — the main CDS Add Plugin.
 *
 * Verifies that the plugin orchestrates the individual configurators
 * correctly: XsSecurityConfigurator, PortalServiceConfigurator, and
 * WorkzoneConfigurator.  Each configurator has its own dedicated test
 * suite; these tests focus on end-to-end orchestration.
 */
import { expect } from "chai";
import fs from "fs";
import { join } from "path";

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
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
      createMtaWithPortal(project, "flp");
      createCommonDataModel(project, "flp");

      runCdsAddDataInspector(project);

      // XsSecurityConfigurator should have added the scope.
      const xsSecurity = readXsSecurity(project);
      const scopeCount = countScope(xsSecurity, DATA_INSPECTOR_SCOPE);
      expect(scopeCount).to.equal(1, "XsSecurityConfigurator should have added scope");

      // PortalServiceConfigurator should have added catalog and group.
      const cdm = readCommonDataModel(project, "flp");
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
      const project = await createTestProject(tempUtil, { xsuaa: true });

      // No mta.yaml and no CommonDataModel.json → portal configurator is skipped.
      runCdsAddDataInspector(project);

      // XsSecurityConfigurator should still have run.
      const xsSecurity = readXsSecurity(project);
      const scopeCount = countScope(xsSecurity, DATA_INSPECTOR_SCOPE);
      expect(scopeCount).to.equal(1, "XsSecurityConfigurator should have run");

      // CommonDataModel.json should not have been created.
      const cdmPath = join(project, "flp", "portal-site", "CommonDataModel.json");
      expect(fs.existsSync(cdmPath)).to.be.false;
    });
  });
});
