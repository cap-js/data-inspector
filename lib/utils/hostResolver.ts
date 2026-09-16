/**
 * Runtime/host detection and OData base-path resolution for the data-inspector
 * build task.
 */
const cds = require("@sap/cds");
const { exists, path } = cds.utils;
const { join } = path;

/** CAP default OData V4 base path (both runtimes). */
export const DEFAULT_ODATA_V4_BASE_PATH = "/odata/v4";

/**
 * Returns true when the host project is a CAP **Java** project.
 *
 * Detection is intentionally simple and dependency-free: a CAP Java project has
 * a `pom.xml` at its root (and typically an `srv/pom.xml`). CAP Node.js projects
 * do not.
 */
export function isJavaProject(): boolean {
  return exists(join(cds.root, "pom.xml")) || exists(join(cds.root, "srv", "pom.xml"));
}

/**
 * Normalizes a base path to have a leading slash and no trailing slash
 * (e.g. `/odata/v4` or `/api`). Falls back to {@link DEFAULT_ODATA_V4_BASE_PATH}
 * when the input is null/blank.
 */
export function normalizeBasePath(basePath: string | null | undefined): string {
  let p = (basePath ?? "").trim();
  if (!p) p = DEFAULT_ODATA_V4_BASE_PATH;
  if (!p.startsWith("/")) p = "/" + p;
  while (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * Resolves the effective OData V4 base path for the host project.
 * Falls back to {@link DEFAULT_ODATA_V4_BASE_PATH} when not configured.
 */
export function resolveODataV4BasePath(): string {
  const configuredBasePath =
    cds.env["data-inspector"]?.odataV4BasePath || cds.env.protocols["odata-v4"]?.path;
  if (configuredBasePath) {
    return normalizeBasePath(configuredBasePath);
  }
  return DEFAULT_ODATA_V4_BASE_PATH;
}

/**
 * Builds the `mainService` data-source URI for the resolved base path, e.g.
 * `/odata/v4/data-inspector/` or `/api/data-inspector/` (always trailing slash).
 */
export function buildMainServiceUri(basePath: string): string {
  const DATA_INSPECTOR_SERVICE_PATH = "data-inspector";
  return `${normalizeBasePath(basePath)}/${DATA_INSPECTOR_SERVICE_PATH}/`;
}

/**
 * Returns the default local CAP server URL for the ui5.yaml dev proxy.
 * Java hosts default to :8080, Node.js hosts to :4004.
 */
export function resolveLocalServerUrl(): string {
  const DEFAULT_NODE_SERVER_URL = "http://localhost:4004";
  const DEFAULT_JAVA_SERVER_URL = "http://localhost:8080";
  return isJavaProject() ? DEFAULT_JAVA_SERVER_URL : DEFAULT_NODE_SERVER_URL;
}
