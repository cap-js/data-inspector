/**
 * Runtime/host detection and OData base-path resolution for the data-inspector
 * build task.
 *
 * These helpers detect whether the host project is a CAP Java project and
 * resolve the effective OData V4 base path so the build task can patch the UI
 * artifacts accordingly.
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
 *
 * For **CAP Node.js** hosts: CAP Node.js does not support configuring the OData
 * V4 adapter base path. The endpoint is always the default `/odata/v4`.
 *
 * For **CAP Java** hosts: reads `cds.odata-v4.endpoint.path` from `cds.env`
 * (surfaced as `cds.env.odataV4.endpoint.path`), falling back to
 * {@link DEFAULT_ODATA_V4_BASE_PATH} when not configured.
 */
export function resolveODataV4BasePath(): string {
  if (!isJavaProject()) {
    // Node.js: OData adapter base path is not configurable — always /odata/v4.
    return DEFAULT_ODATA_V4_BASE_PATH;
  }

  // Java: read the configured OData V4 adapter base path from cds.env.
  const javaPath = cds.env.odataV4?.endpoint?.path;
  if (javaPath) return normalizeBasePath(javaPath);

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
