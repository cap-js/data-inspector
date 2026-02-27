/**
 * Helpers for setting up test CAP projects
 */
import { execSync } from "child_process";
import { join, resolve } from "path";
import fs from "fs";

import { TempUtil } from "./temp-util";

// Get the absolute path to the data-inspector gen directory (compiled output)
const DATA_INSPECTOR_ROOT = resolve(__dirname, "..", "..", "gen");

/**
 * Options for creating a test project
 */
interface ProjectOptions {
  xsuaa?: boolean;
  mta?: boolean;
}

/**
 * Updates package.json to add data-inspector as a local dependency
 */
function updateDependency(projectFolder: string): void {
  const packageJSONPath = join(projectFolder, "package.json");
  const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, "utf8"));
  packageJSON.dependencies = packageJSON.dependencies || {};
  packageJSON.dependencies["@cap-js/data-inspector"] = `file:${DATA_INSPECTOR_ROOT}`;
  fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 4));
}

/**
 * Hack to replace @sap/cds with @sap/cds-dk in the installed plugin file
 * This is required because cds.add is only available in @sap/cds-dk
 */
function setupHack(projectFolder: string): void {
  const pluginDir = join(projectFolder, "node_modules/@cap-js/data-inspector");
  const cdsPluginPath = join(pluginDir, "cds-plugin.js");
  const cdsPlugin = fs.readFileSync(cdsPluginPath, "utf8");
  const updatedCdsPlugin = cdsPlugin.replace(/require\("@sap\/cds"\)/g, 'require("@sap/cds-dk")');
  fs.writeFileSync(cdsPluginPath, updatedCdsPlugin);
}

/**
 * Create a test CAP project with the specified options
 */
export async function createTestProject(
  tempUtil: TempUtil,
  options: ProjectOptions = {}
): Promise<string> {
  const tempFolder = await tempUtil.mkTempFolder();
  const project = join(tempFolder, "project");

  // Build cds init command
  const addOptions: string[] = [];
  if (options.xsuaa) addOptions.push("xsuaa");
  if (options.mta) addOptions.push("mta");

  const addFlag = addOptions.length > 0 ? `--add ${addOptions.join(",")}` : "";
  execSync(`cds init project ${addFlag} --nodejs`, { cwd: tempFolder });

  // Set up data-inspector plugin
  updateDependency(project);
  execSync(`npm install`, { cwd: project });
  setupHack(project);

  return project;
}

/**
 * Run cds add data-inspector on a project
 */
export function runCdsAddDataInspector(projectFolder: string): void {
  execSync(`cds add data-inspector`, { cwd: projectFolder });
}
