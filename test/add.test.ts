/**
 * Tests for lib/add.ts — the main CDS Add Plugin.
 *
 * Verifies that the plugin orchestrates the individual configurators
 * correctly: XsSecurityConfigurator, MtaConfigurator, and
 * PortalServiceConfigurator.  Each configurator has its own dedicated
 * test suite; these tests focus on end-to-end orchestration.
 */
import { expect } from "chai";
import fs from "fs";
import { join } from "path";

import {
  TempUtil,
  createTestProject,
  runCdsAddDataInspector,
  createMtaWithPortal,
  createCommonDataModel,
  DATA_INSPECTOR_SCOPE,
  DATA_INSPECTOR_CATALOG_ID,
  DATA_INSPECTOR_GROUP_ID,
} from "./helpers";

/** Read and parse xs-security.json */
function readXsSecurity(projectFolder: string): any {
  return JSON.parse(fs.readFileSync(join(projectFolder, "xs-security.json"), "utf8"));
}

/** Count occurrences of a scope in xs-security.json */
function countScope(xsSecurity: any, scopeName: string): number {
  if (!xsSecurity.scopes || !Array.isArray(xsSecurity.scopes)) return 0;
  return xsSecurity.scopes.filter((s: any) => s.name === scopeName).length;
}

/** Read and parse CommonDataModel.json from {deployerPath}/portal-site/ */
function readCommonDataModel(projectFolder: string, deployerPath: string): any {
  const cdmPath = join(projectFolder, deployerPath, "portal-site", "CommonDataModel.json");
  return JSON.parse(fs.readFileSync(cdmPath, "utf8"));
}

describe("cds add data-inspector", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    // await tempUtil.cleanUp();
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
