/**
 * Helpers for setting up test CAP projects
 */
import { execSync } from "child_process";
import { join, resolve } from "path";
import fs from "fs";

import { TempUtil } from "./TempUtil";

// Get the absolute path to the data-inspector gen directory (compiled output)
const DATA_INSPECTOR_ROOT = resolve(__dirname, "..", "..", "gen");
const CDS_ROOT = resolve(require.resolve("@sap/cds/package.json"), "..");
export const cdsBin = require.resolve("@sap/cds-dk/bin/cds.js");

/**
 * Options for creating a test project
 */
interface ProjectOptions {
  xsuaa?: boolean;
  mta?: boolean;
}

/**
 * Updates package.json to add data-inspector as a dependency
 */
function updateDependency(projectFolder: string): void {
  const packageJSONPath = join(projectFolder, "package.json");
  const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, "utf8"));
  packageJSON.dependencies = packageJSON.dependencies || {};
  packageJSON.dependencies["@cap-js/data-inspector"] = `file:${DATA_INSPECTOR_ROOT}`;
  packageJSON.dependencies["@sap/cds"] = `file:${CDS_ROOT}`; // also link our cds to ensure the test app sees the same
  // make sure we also work w/o the app having a cds-dk dependency
  delete packageJSON.dependencies["@sap/cds-dk"];
  delete packageJSON.devDependencies?.["@sap/cds-dk"];
  fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 4));
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
  try {
    execSync(`${cdsBin} init project ${addFlag} --nodejs`, { cwd: tempFolder, stdio: "pipe" });
  } catch (error) {
    throw new Error(`Failed to run '${cdsBin} init project' in: ${tempFolder}`, { cause: error });
  }

  // Set up data-inspector plugin
  updateDependency(project);
  execSync(`npm install`, { cwd: project });

  return project;
}

/**
 * Run cds add data-inspector on a project
 */
export function runCdsAddDataInspector(projectFolder: string): void {
  try {
    execSync(`${cdsBin} add data-inspector`, { cwd: projectFolder });
  } catch (error) {
    throw new Error(`Failed to run '${cdsBin} add data-inspector' in: ${projectFolder}`, {
      cause: error,
    });
  }
}
