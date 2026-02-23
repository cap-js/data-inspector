/**
 * MTA file helper utilities for reading, parsing, and modifying mta.yaml
 */
const cds = require("@sap/cds-dk");
const { exists, read, write, path, yaml } = cds.utils;
const { join } = path;

import { DATA_INSPECTOR_MTA_MODULE_NAME, DEFAULT_SRV_DESTINATION } from "./constants";

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
    log.error(`Failed to parse MTA file: ${error.message}`);
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
 * Check if a resource with specific service and plan exists in MTA
 */
export function hasResource(mtaContent: any, service: string, servicePlan: string): boolean {
  const resources = mtaContent?.resources || [];
  return resources.some(
    (resource: any) =>
      resource.parameters?.service === service &&
      resource.parameters?.["service-plan"] === servicePlan
  );
}

/**
 * Check if the host project uses cloud portal service
 */
export function hasPortalService(mtaContent: any): boolean {
  return hasResource(mtaContent, "portal", "standard");
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

/**
 * Detect the CAP backend service destination name from mta.yaml
 * Detection priority:
 * 1. Content module's parameters.config.destinations (where url references srv-url)
 * 2. nodejs module's provides section with srv-url property
 * 3. Existing HTML5 app's xs-app.json OData route destination
 * 4. Falls back to "srv-api" (standard CAP convention)
 */
export async function detectSrvDestination(mtaContent: any): Promise<string> {
  if (!mtaContent) return DEFAULT_SRV_DESTINATION;

  const modules = mtaContent.modules || [];

  // 1. Look for content module with destinations config referencing srv-url
  const contentModuleWithDest = modules.find(
    (m: any) => m.type === "com.sap.application.content" && m.parameters?.config?.destinations
  );

  if (contentModuleWithDest) {
    const destinations = contentModuleWithDest.parameters.config.destinations;
    const srvDest = destinations.find(
      (d: any) => d.url && (d.url.includes("srv-url") || d.url.includes("srv-api"))
    );
    if (srvDest?.name) {
      log.debug(`Detected destination '${srvDest.name}' from content module config`);
      return srvDest.name;
    }
  }

  // 2. Look for nodejs module with provides section containing srv-url
  const srvModule = modules.find(
    (m: any) => m.type === "nodejs" && m.provides?.some((p: any) => p.properties?.["srv-url"])
  );

  if (srvModule) {
    const provider = srvModule.provides.find((p: any) => p.properties?.["srv-url"]);
    if (provider?.name) {
      log.debug(`Detected destination '${provider.name}' from nodejs module provides`);
      return provider.name;
    }
  }

  // 3. Check existing HTML5 app's xs-app.json for OData routes
  const html5Module = modules.find(
    (m: any) => m.type === "html5" && m.name !== DATA_INSPECTOR_MTA_MODULE_NAME && m.path
  );

  if (html5Module) {
    const xsAppPath = join(html5Module.path, "xs-app.json");
    if (exists(xsAppPath)) {
      try {
        const xsApp = await read(xsAppPath);
        const odataRoute = xsApp.routes?.find(
          (r: any) => r.source?.includes("odata") && r.destination
        );
        if (odataRoute?.destination) {
          log.debug(`Detected destination '${odataRoute.destination}' from existing HTML5 app`);
          return odataRoute.destination;
        }
      } catch {
        // Ignore errors reading existing xs-app.json
      }
    }
  }

  // 4. Default fallback
  return DEFAULT_SRV_DESTINATION;
}
