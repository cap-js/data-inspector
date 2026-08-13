/**
 * CDS build plugin for the data-inspector UI5 app.
 *
 * Runs as part of `cds build` to prepare the UI5 app for deployment.
 * The plugin copies the bundled UI5 app source from the plugin's own
 * package into the build output folder (gen/cap-js-data-inspector-ui)
 * and applies runtime-specific patches:
 *
 *   - OData V4 base path:  The UI's manifest.json (mainService.uri) and
 *     xs-app.json OData route target the CAP server's OData V4 endpoint.
 *     For CAP Java hosts this base path may be customized (e.g. /api via
 *     cds.odata-v4.endpoint.path); for Node.js it stays /odata/v4. The
 *     effective base path is resolved (see lib/utils/hostResolver) and
 *     patched into both files.
 *
 *   - xs-app.json destination:  The OData route destination defaults to
 *     "srv-api".  If the host project uses a different name, it is
 *     resolved from cds.env or auto-detected from existing UI5 apps.
 *
 *   - manifest.json sap.cloud.service:  Required for SAP Build Work
 *     Zone content discovery.  Patched when a value is available from
 *     cds.env or auto-detected from an existing UI5 app's manifest.
 *     Skipped silently when neither source provides a value.
 *
 * For MTA deployments the resulting folder is referenced by the html5
 * module in mta.yaml (added by `cds add data-inspector`).  The MTA
 * build tooling runs `npm install` and `npm run build:cf` inside this
 * folder to produce the deployable ZIP.
 *
 * For Kyma / @sap/html5-app-deployer deployments the consumer is
 * expected to include the contents of gen/cap-js-data-inspector-ui in
 * their own html5 content image.  See README for details.
 */
const cds = require("@sap/cds");
const { exists, path } = cds.utils;
const { join } = path;
const fs = require("fs");
import YAML from "yaml";

import {
  isJavaProject,
  resolveODataV4BasePath,
  resolveLocalServerUrl,
  buildMainServiceUri,
  normalizeBasePath,
  DEFAULT_ODATA_V4_BASE_PATH,
} from "./utils/hostResolver";

const log = cds.log("data-inspector");

const DEFAULT_SRV_DESTINATION = "srv-api";

module.exports = class DataInspectorBuildPlugin extends cds.build.Plugin {
  static hasTask() {
    return true;
  }

  static taskDefaults = {
    src: ".",
    dest: "cap-js-data-inspector-ui",
  };

  init() {
    this.task.dest = join(
      cds.root,
      cds.env.build.target !== "." ? cds.env.build.target : "gen",
      "cap-js-data-inspector-ui"
    );
  }

  async build() {
    const uiAppSrc = join(
      cds.root,
      "node_modules",
      "@cap-js",
      "data-inspector",
      "app",
      "data-inspector-ui"
    );
    if (!exists(uiAppSrc)) {
      log.warn(
        "Could not locate data-inspector UI5 app source, skipping build task; See README for detail on build task"
      );
      return;
    }

    await this.copy(uiAppSrc).to(this.task.dest);

    // Patch the OData V4 base path into manifest.json (mainService.uri) and
    // xs-app.json (OData route). For CAP Java hosts the base path may differ
    // from the CAP default (e.g. /api); for Node.js it stays /odata/v4 unless
    // explicitly overridden.
    const basePath = resolveODataV4BasePath();
    if (basePath !== DEFAULT_ODATA_V4_BASE_PATH) {
      await this.patchManifestBasePath(basePath);
      await this.patchXsAppBasePath(basePath);
      log.debug(`Patched OData V4 base path to '${basePath}' (Java project: ${isJavaProject()})`);
    }

    // Always align the local `ui5 serve` dev proxy (ui5.yaml) with the resolved
    // base path + local server URL, so `npm start` forwards the UI's OData calls
    // to the running CAP server (e.g. /api → http://localhost:8080 for Java).
    await this.patchUi5DevProxy(basePath, resolveLocalServerUrl());

    // Patch xs-app.json destination when the project uses a non-default name
    const destination = await this.resolveDestination();
    if (destination !== DEFAULT_SRV_DESTINATION) {
      await this.patchXsAppDestination(destination);
      log.debug(`Patched xs-app.json destination to '${destination}'`);
    }

    // Patch manifest.json with sap.cloud.service when a value is available
    const cloudService = await this.resolveCloudService();
    if (cloudService) {
      await this.patchManifestCloudService(cloudService);
      log.debug(`Patched manifest.json sap.cloud.service to '${cloudService}'`);
    }
  }

  /**
   * Determines the backend destination name for OData routes.
   *
   * Resolution order:
   *   1. cds.env["data-inspector"].destination  (explicit config)
   *   2. Auto-detected from an existing UI5 app's xs-app.json
   *   3. "srv-api"  (CAP default)
   */
  private async resolveDestination(): Promise<string> {
    const configured = cds.env["data-inspector"]?.destination;
    if (configured) return configured;

    const detected = await this.detectDestinationFromApps();
    if (detected) return detected;

    return DEFAULT_SRV_DESTINATION;
  }

  /**
   * Scans app/{name}/xs-app.json for a route whose source pattern
   * indicates OData or API traffic and returns its destination value.
   */
  private async detectDestinationFromApps(): Promise<string | null> {
    const appDirPath = join(cds.root, "app");
    if (!exists(appDirPath)) return null;

    try {
      const entries = fs.readdirSync(appDirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const xsAppPath = join(appDirPath, entry.name, "xs-app.json");
        if (!exists(xsAppPath)) continue;

        try {
          const xsApp = JSON.parse(fs.readFileSync(xsAppPath, "utf8"));
          const odataRoute = xsApp.routes?.find(
            // xs-app.json routes have dynamic structure
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (r: any) => r.destination && (r.source?.includes("odata") || r.source?.includes("api"))
          );
          if (odataRoute?.destination) {
            return odataRoute.destination;
          }
        } catch {
          // skip unreadable file
        }
      }
    } catch {
      // skip inaccessible directory
    }

    return null;
  }

  /**
   * Replaces the destination value in every route of the build output's
   * xs-app.json.  Since we own this file and it contains exactly one
   * route with a destination property, this is safe.
   */
  private async patchXsAppDestination(destination: string): Promise<void> {
    const xsAppPath = join(this.task.dest, "xs-app.json");
    if (!exists(xsAppPath)) {
      log.debug("xs-app.json not found in build output, cannot patch destination");
      return;
    }

    const xsApp = JSON.parse(fs.readFileSync(xsAppPath, "utf8"));

    for (const route of xsApp.routes || []) {
      if (route.destination) {
        route.destination = destination;
      }
    }

    fs.writeFileSync(xsAppPath, JSON.stringify(xsApp, null, 2));
  }

  /**
   * Determines the sap.cloud.service value needed for Work Zone.
   *
   * Resolution order:
   *   1. cds.env["data-inspector"].cloudService  (explicit config)
   *   2. Auto-detected from an existing UI5 app's manifest.json
   *   3. null  (skipped silently)
   */
  private async resolveCloudService(): Promise<string | null> {
    const configured = cds.env["data-inspector"]?.cloudService;
    if (configured) return configured;

    const detected = await this.detectCloudServiceFromApps();
    if (detected) return detected;

    return null;
  }

  /**
   * Scans app/{name}/webapp/manifest.json for sap.cloud.service
   * and returns the first value found.
   */
  private async detectCloudServiceFromApps(): Promise<string | null> {
    const appDirPath = join(cds.root, "app");
    if (!exists(appDirPath)) return null;

    try {
      const entries = fs.readdirSync(appDirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const manifestPath = join(appDirPath, entry.name, "webapp", "manifest.json");
        if (!exists(manifestPath)) continue;

        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          const cloudService = manifest?.["sap.cloud"]?.service;
          if (cloudService) return cloudService;
        } catch {
          // skip unreadable file
        }
      }
    } catch {
      // skip inaccessible directory
    }

    return null;
  }

  /**
   * Adds or overwrites the sap.cloud section in the build output's
   * manifest.json.  Required for Work Zone content discovery.
   */
  private async patchManifestCloudService(cloudService: string): Promise<void> {
    const manifestPath = join(this.task.dest, "webapp", "manifest.json");
    if (!exists(manifestPath)) {
      log.debug("manifest.json not found in build output, cannot patch sap.cloud.service");
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    manifest["sap.cloud"] = {
      public: true,
      service: cloudService,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Patches the UI's manifest.json mainService data-source URI to point at the
   * resolved OData V4 base path, e.g. "/odata/v4/data-inspector/" or
   * "/api/data-inspector/".
   */
  private async patchManifestBasePath(basePath: string): Promise<void> {
    const manifestPath = join(this.task.dest, "webapp", "manifest.json");
    if (!exists(manifestPath)) {
      log.debug("manifest.json not found in build output, cannot patch base path");
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const mainService = manifest?.["sap.app"]?.dataSources?.mainService;
    if (!mainService) {
      log.debug("manifest.json has no sap.app.dataSources.mainService, cannot patch base path");
      return;
    }

    mainService.uri = buildMainServiceUri(basePath);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Patches the build output's xs-app.json OData route so its source/target
   * match the resolved OData V4 base path. The bundled xs-app.json ships with
   * an "/odata/v4/*" route; when the host uses a different base path (e.g.
   * "/api") the route is rewritten to forward that prefix to the backend.
   */
  private async patchXsAppBasePath(basePath: string): Promise<void> {
    const xsAppPath = join(this.task.dest, "xs-app.json");
    if (!exists(xsAppPath)) {
      log.debug("xs-app.json not found in build output, cannot patch base path");
      return;
    }

    const normalized = normalizeBasePath(basePath);
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const xsApp = JSON.parse(fs.readFileSync(xsAppPath, "utf8"));

    // Rewrite the OData route (the one carrying a backend destination) to the
    // resolved base path, preserving all other route properties.
    for (const route of xsApp.routes || []) {
      if (route.destination) {
        route.source = `^${escaped}/(.*)`;
        route.target = `${normalized}/$1`;
      }
    }

    fs.writeFileSync(xsAppPath, JSON.stringify(xsApp, null, 2));
  }

  /**
   * Aligns the build output's ui5.yaml `fiori-tools-proxy` backend entry with
   * the resolved OData base path and local CAP server URL, so running the UI
   * standalone via `ui5 serve` (`npm start`) forwards its OData requests to the
   * running server.
   *
   * For a CAP Java host at /api on :8080 this yields:
   *   backend: [{ path: /api, url: http://localhost:8080 }]
   * For CAP Node.js it stays /odata → http://localhost:4004.
   *
   * The proxy `path` is set to the base path's first segment (e.g. `/api` or
   * `/odata`) so all OData traffic under it is forwarded.
   */
  private async patchUi5DevProxy(basePath: string, serverUrl: string): Promise<void> {
    const ui5YamlPath = join(this.task.dest, "ui5.yaml");
    if (!exists(ui5YamlPath)) {
      log.debug("ui5.yaml not found in build output, cannot patch dev proxy");
      return;
    }

    // Use the first path segment of the base path as the proxy prefix
    // (e.g. "/odata/v4" → "/odata", "/api" → "/api").
    const normalized = normalizeBasePath(basePath);
    const proxyPath = "/" + normalized.split("/").filter(Boolean)[0];

    try {
      const doc = YAML.parse(fs.readFileSync(ui5YamlPath, "utf8"));
      const middlewares = doc?.server?.customMiddleware;
      if (!Array.isArray(middlewares)) {
        log.debug("ui5.yaml has no server.customMiddleware, cannot patch dev proxy");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proxy = middlewares.find((m: any) => m?.name === "fiori-tools-proxy");
      const backend = proxy?.configuration?.backend;
      if (!Array.isArray(backend) || backend.length === 0) {
        log.debug("ui5.yaml fiori-tools-proxy has no backend entry, cannot patch dev proxy");
        return;
      }

      backend[0].path = proxyPath;
      backend[0].url = serverUrl;

      fs.writeFileSync(ui5YamlPath, YAML.stringify(doc));
      log.debug(`Patched ui5.yaml dev proxy: ${proxyPath} → ${serverUrl}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.debug(`Failed to patch ui5.yaml dev proxy: ${message}`);
    }
  }
};
