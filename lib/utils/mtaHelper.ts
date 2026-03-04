/**
 * MTA file helper utilities for reading, parsing, and modifying mta.yaml
 */
const cds = require("@sap/cds-dk");
const { exists, read, write, path, yaml } = cds.utils;

const log = cds.log("data-inspector");

/**
 * Get the path to the MTA file
 * Returns null if mta.yaml does not exist
 */
export function getMtaPath(): string | null {
  if (exists("mta.yaml")) return "mta.yaml";
  return null;
}

/**
 * Read and parse the MTA file
 */
export async function readMta(): Promise<any | null> {
  const mtaPath = getMtaPath();
  if (!mtaPath) return null;

  try {
    return cds.parse.yaml(await read(mtaPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Failed to parse MTA file: ${message}`);
    return null;
  }
}

/**
 * Write the MTA content back to file
 */
export async function writeMta(mtaContent: any): Promise<void> {
  const mtaPath = getMtaPath();
  if (!mtaPath) return;

  await write(yaml.dump(mtaContent)).to(mtaPath);
}

/**
 * Find the content module (type: com.sap.application.content, path: .)
 */
export function findContentModule(mtaContent: any): any | null {
  const modules = mtaContent?.modules || [];
  return (
    modules.find((m: any) => m.type === "com.sap.application.content" && m.path === ".") || null
  );
}
