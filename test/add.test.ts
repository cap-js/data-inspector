import { execSync } from "child_process";
import { join, resolve } from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { expect } from "chai";

const DATA_INSPECTOR_SCOPE = "$XSAPPNAME.capDataInspectorReadonly";

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
 * Hack to replace @sap/cds with @sap/cds-dk in the installed cds-plugin.js
 * This is required because cds.add is only available in @sap/cds-dk
 */
function setupHack(projectFolder: string): void {
  const cdsPluginPath = join(projectFolder, "node_modules/@cap-js/data-inspector/cds-plugin.js");
  const cdsPlugin = fs.readFileSync(cdsPluginPath, "utf8");
  // Replace requires from cds to cds-dk (handles TypeScript compiled output)
  const updatedData = cdsPlugin.replace(/require\("@sap\/cds"\)/g, 'require("@sap/cds-dk")');
  fs.writeFileSync(cdsPluginPath, updatedData);
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
    execSync(`cds init bookshop --add xsuaa`, { cwd: temp });

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
    execSync(`cds init project --add xsuaa`, { cwd: tempExisting });
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
    execSync(`cds init project`, { cwd: tempNoXsuaa });
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
