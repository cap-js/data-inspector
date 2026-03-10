/**
 * CDS build plugin for the data-inspector UI5 app.
 *
 * Runs as part of `cds build` to prepare the UI5 app for deployment.
 * The plugin copies the bundled UI5 app source from the plugin's own
 * package into the build output folder (gen/cap-js-data-inspector-ui)
 * and applies runtime-specific patches:
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
const cds = require("@sap/cds-dk");
const { exists, path } = cds.utils;
const { join } = path;
const fs = require("fs");

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
      log.warn("Could not locate data-inspector UI5 app source, skipping build task");
      return;
    }

    await this.copy(uiAppSrc).to(this.task.dest);

    // Patch xs-app.json destination when the project uses a non-default name
    const destination = await this.resolveDestination();
    if (destination !== DEFAULT_SRV_DESTINATION) {
      await this.patchXsAppDestination(destination);
      log.info(`Patched xs-app.json destination to '${destination}'`);
    }

    // Patch manifest.json with sap.cloud.service when a value is available
    const cloudService = await this.resolveCloudService();
    if (cloudService) {
      await this.patchManifestCloudService(cloudService);
      log.info(`Patched manifest.json sap.cloud.service to '${cloudService}'`);
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
      log.warn("xs-app.json not found in build output, cannot patch destination");
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
      log.warn("manifest.json not found in build output, cannot patch sap.cloud.service");
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    manifest["sap.cloud"] = {
      public: true,
      service: cloudService,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
};
