/**
 * Tests for XsSecurityConfigurator
 * Tests the addition of data-inspector scope to xs-security.json
 */
import { expect } from "chai";
import fs from "fs";
import { join } from "path";

import {
  TempUtil,
  createTestProject,
  runCdsAddDataInspector,
  readXsSecurity,
  xsSecurityExists,
  countScope,
  DATA_INSPECTOR_SCOPE,
} from "./helpers";

describe("XsSecurityConfigurator", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    await tempUtil.cleanUp();
  });

  describe("scope addition", () => {
    it("should add data-inspector scope to xs-security.json", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true });

      // Verify initial state
      const initialXsSecurity = readXsSecurity(project);
      const initialScopeCount = countScope(initialXsSecurity, DATA_INSPECTOR_SCOPE);
      expect(initialScopeCount).to.equal(0, "Scope should not exist initially");

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify the scope was added
      const updatedXsSecurity = readXsSecurity(project);
      const updatedScopeCount = countScope(updatedXsSecurity, DATA_INSPECTOR_SCOPE);
      expect(updatedScopeCount).to.equal(1, "Scope should be added exactly once");

      // Verify the scope has the correct description
      const scope = updatedXsSecurity.scopes.find((s: any) => s.name === DATA_INSPECTOR_SCOPE);
      expect(scope).to.exist;
      expect(scope.description).to.equal("Read access for @cap-js/data-inspector");
    });

    it("should not duplicate scope when run multiple times", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true });

      // Run cds add data-inspector twice
      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

      // Verify the scope is still only present once
      const xsSecurity = readXsSecurity(project);
      const scopeCount = countScope(xsSecurity, DATA_INSPECTOR_SCOPE);
      expect(scopeCount).to.equal(1, "Scope should not be duplicated");
    });

    it("should not modify existing scope with different description", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true });

      // Manually add the scope with a custom description
      const xsSecurityPath = join(project, "xs-security.json");
      const xsSecurity = JSON.parse(fs.readFileSync(xsSecurityPath, "utf8"));
      const customDescription = "Custom description for testing";
      xsSecurity.scopes = xsSecurity.scopes || [];
      xsSecurity.scopes.push({
        name: DATA_INSPECTOR_SCOPE,
        description: customDescription,
      });
      fs.writeFileSync(xsSecurityPath, JSON.stringify(xsSecurity, null, 2));

      // Run cds add data-inspector
      runCdsAddDataInspector(project);

      // Verify the scope was not duplicated and description was not changed
      const updatedXsSecurity = readXsSecurity(project);
      const scopeCount = countScope(updatedXsSecurity, DATA_INSPECTOR_SCOPE);
      expect(scopeCount).to.equal(1, "Scope should not be duplicated");

      const scope = updatedXsSecurity.scopes.find((s: any) => s.name === DATA_INSPECTOR_SCOPE);
      expect(scope).to.exist;
      expect(scope.description).to.equal(customDescription, "Description should not be changed");
    });
  });

  describe("when xs-security.json does not exist", () => {
    it("should not create xs-security.json", async () => {
      // Create project without xsuaa (no xs-security.json)
      const project = await createTestProject(tempUtil, { xsuaa: false });

      // Verify xs-security.json does not exist
      expect(xsSecurityExists(project)).to.be.false;

      // Run cds add data-inspector - should not throw
      runCdsAddDataInspector(project);

      // Verify xs-security.json still does not exist (plugin should not create it)
      expect(xsSecurityExists(project)).to.be.false;
    });
  });
});
