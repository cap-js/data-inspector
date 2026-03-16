const cds = require("@sap/cds-dk");
const { exists, read, write, path, yaml } = cds.utils;

const log = cds.log("data-inspector");

export function getMtaPath(): string | null {
  if (exists("mta.yaml")) return "mta.yaml";
  return null;
}

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

export async function writeMta(mtaContent: any): Promise<void> {
  const mtaPath = getMtaPath();
  if (!mtaPath) return;

  await write(yaml.dump(mtaContent)).to(mtaPath);
}

/**
 * Finds the MTA module responsible for deploying HTML5 app content to
 * the HTML5 Application Repository.
 *
 * 1. Collect resource names whose type is org.cloudfoundry.managed-service
 *    with service: html5-apps-repo and service-plan: app-host.
 * 2. Return the first com.sap.application.content module whose requires
 *    array targets one of those resources with content-target: true.
 */
export function findContentModule(mtaContent: any): any | null {
  const resources = mtaContent?.resources || [];
  const modules = mtaContent?.modules || [];

  const html5RepoHostNames = new Set(
    resources
      .filter(
        (r: any) =>
          r.type === "org.cloudfoundry.managed-service" &&
          r.parameters?.service === "html5-apps-repo" &&
          r.parameters?.["service-plan"] === "app-host"
      )
      .map((r: any) => r.name)
  );

  if (html5RepoHostNames.size === 0) return null;

  return (
    modules.find((m: any) => {
      if (m.type !== "com.sap.application.content") return false;
      const requires = m.requires || [];
      return requires.some(
        (req: any) =>
          html5RepoHostNames.has(req.name) && req.parameters?.["content-target"] === true
      );
    }) || null
  );
}

/**
 * Resolves the file-system path to the portal-site directory by
 * inspecting mta.yaml for the FLP deployer module.
 *
 * The FLP deployer is a com.sap.application.content module whose
 * requires array targets a portal service resource (service: portal,
 * service-plan: standard) with content-target: true.  Its "path"
 * property is the base directory containing portal-site/.
 *
 * Returns the module's path (e.g. "flp") or null if not found.
 */
export function findPortalDeployerPath(mtaContent: any): string | null {
  const resources = mtaContent?.resources || [];
  const modules = mtaContent?.modules || [];

  const portalResourceNames = new Set(
    resources
      .filter(
        (r: any) =>
          r.type === "org.cloudfoundry.managed-service" &&
          r.parameters?.service === "portal" &&
          r.parameters?.["service-plan"] === "standard"
      )
      .map((r: any) => r.name)
  );

  if (portalResourceNames.size === 0) return null;

  const flpDeployer = modules.find((m: any) => {
    if (m.type !== "com.sap.application.content") return false;
    const requires = m.requires || [];
    return requires.some(
      (req: any) => portalResourceNames.has(req.name) && req.parameters?.["content-target"] === true
    );
  });

  if (!flpDeployer || !flpDeployer.path) return null;

  return flpDeployer.path;
}
