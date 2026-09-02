/**
 * Runtime/host detection and OData base-path resolution for the data-inspector
 * build task.
 *
 * The reuse UI5 app's `manifest.json` (`mainService` data source) and
 * `xs-app.json` OData route must point at the consuming CAP server's OData V4
 * endpoint. That endpoint differs between runtimes:
 *
 *   - CAP Node.js: the plugin's service `@path` is treated as absolute, so the
 *     service is served at `/odata/v4/data-inspector/` by default.
 *   - CAP Java: the configured OData V4 base path (`cds.odata-v4.endpoint.path`,
 *     default `/odata/v4`) is always prepended to the service's relative
 *     `@path`. A host may customize it (e.g. `/api`), moving the service to
 *     `/api/data-inspector/`.
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
 * For **CAP Node.js** hosts the base path is always `/odata/v4` — the plugin's
 * service uses an absolute `@path` annotation, so the endpoint is fixed
 * regardless of any configuration. `odataBasePath` is ignored for Node.js.
 *
 * For **CAP Java** hosts:
 *   1. `cds.env["data-inspector"].odataBasePath`  (explicit override)
 *   2. `cds.env.odataV4?.endpoint?.path` (the CAP Java setting
 *      `cds.odata-v4.endpoint.path`, surfaced camel-cased in cds.env)
 *   3. {@link DEFAULT_ODATA_V4_BASE_PATH}  (`/odata/v4`)
 */
export function resolveODataV4BasePath(): string {
  // Node.js: the service @path is absolute → base path is always the default.
  if (!isJavaProject()) {
    return DEFAULT_ODATA_V4_BASE_PATH;
  }

  // Java: check explicit config first, then auto-detect from cds.env.
  const configured = cds.env["data-inspector"]?.odataBasePath;
  if (configured) return normalizeBasePath(configured);

  const javaPath = cds.env.odataV4?.endpoint?.path;
  if (javaPath) return normalizeBasePath(javaPath);

  return DEFAULT_ODATA_V4_BASE_PATH;
}

/**
 * The plugin's OData service path segment (matches the CDS service `@path`).
 * The UI's `mainService` URI is `<basePath>/data-inspector/`.
 */
export const DATA_INSPECTOR_SERVICE_PATH = "data-inspector";

/**
 * Builds the `mainService` data-source URI for the resolved base path, e.g.
 * `/odata/v4/data-inspector/` or `/api/data-inspector/` (always trailing slash).
 */
export function buildMainServiceUri(basePath: string): string {
  return `${normalizeBasePath(basePath)}/${DATA_INSPECTOR_SERVICE_PATH}/`;
}

/** Default local CAP server URL per runtime (used by the ui5.yaml dev proxy). */
export const DEFAULT_NODE_SERVER_URL = "http://localhost:4004";
export const DEFAULT_JAVA_SERVER_URL = "http://localhost:8080";

/**
 * Returns the default local CAP server URL for the ui5.yaml dev proxy.
 * Java hosts default to :8080, Node.js hosts to :4004.
 *
 * If your server runs on a non-standard port, edit the generated
 * `gen/cap-data-inspector-ui/ui5.yaml` after running `cds build`.
 */
export function resolveLocalServerUrl(): string {
  return isJavaProject() ? DEFAULT_JAVA_SERVER_URL : DEFAULT_NODE_SERVER_URL;
}
