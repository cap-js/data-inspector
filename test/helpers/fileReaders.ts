/**
 * Helpers for reading and parsing test project files.
 *
 * Portal-related readers require a deployer path parameter so that tests
 * always specify the exact path used in mta.yaml — no default is assumed.
 */
import fs from "fs";
import { join } from "path";

/**
 * Read and parse xs-security.json
 */
export function readXsSecurity(projectFolder: string): any {
  const xsSecurityPath = join(projectFolder, "xs-security.json");
  return JSON.parse(fs.readFileSync(xsSecurityPath, "utf8"));
}

/**
 * Check if xs-security.json exists
 */
export function xsSecurityExists(projectFolder: string): boolean {
  const xsSecurityPath = join(projectFolder, "xs-security.json");
  return fs.existsSync(xsSecurityPath);
}

/**
 * Count occurrences of a scope in xs-security.json
 */
export function countScope(xsSecurity: any, scopeName: string): number {
  if (!xsSecurity.scopes || !Array.isArray(xsSecurity.scopes)) {
    return 0;
  }
  return xsSecurity.scopes.filter((s: any) => s.name === scopeName).length;
}

/**
 * Read and parse CommonDataModel.json from {deployerPath}/portal-site/.
 * @param deployerPath  The FLP deployer module path as declared in mta.yaml
 */
export function readCommonDataModel(projectFolder: string, deployerPath: string): any {
  const cdmPath = join(projectFolder, deployerPath, "portal-site", "CommonDataModel.json");
  return JSON.parse(fs.readFileSync(cdmPath, "utf8"));
}

/**
 * Check if CommonDataModel.json exists under {deployerPath}/portal-site/
 * @param deployerPath  The FLP deployer module path as declared in mta.yaml
 */
export function commonDataModelExists(projectFolder: string, deployerPath: string): boolean {
  const cdmPath = join(projectFolder, deployerPath, "portal-site", "CommonDataModel.json");
  return fs.existsSync(cdmPath);
}

/**
 * Read and parse mta.yaml
 */
export function readMta(projectFolder: string): any {
  const mtaPath = join(projectFolder, "mta.yaml");
  const yaml = require("@sap/cds-dk").utils.yaml;
  return yaml.load(fs.readFileSync(mtaPath, "utf8"));
}

/**
 * Check if i18n file exists under {deployerPath}/portal-site/
 * @param deployerPath  The FLP deployer module path as declared in mta.yaml
 */
export function i18nFileExists(projectFolder: string, deployerPath: string): boolean {
  const i18nPath = join(
    projectFolder,
    deployerPath,
    "portal-site",
    "i18n",
    "capDataInspector.properties"
  );
  return fs.existsSync(i18nPath);
}

/**
 * Read i18n properties file from {deployerPath}/portal-site/
 * @param deployerPath  The FLP deployer module path as declared in mta.yaml
 */
export function readI18nFile(projectFolder: string, deployerPath: string): string {
  const i18nPath = join(
    projectFolder,
    deployerPath,
    "portal-site",
    "i18n",
    "capDataInspector.properties"
  );
  return fs.readFileSync(i18nPath, "utf8");
}
