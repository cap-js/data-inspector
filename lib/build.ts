/**
 * CDS Build Plugin for @cap-js/data-inspector
 *
 * Copies the data-inspector UI5 app into the build output and patches
 * xs-app.json with the correct backend destination name.
 *
 * Destination resolution order (highest to lowest priority):
 * 1. cds.env configuration: cds.data_inspector.destination
 * 2. Auto-detected from existing UI5 apps in the project
 * 3. Default: "srv-api" (standard CAP convention)
 */
const cds = require("@sap/cds-dk");
const { exists, read, path } = cds.utils;
const { join } = path;

const log = cds.log("data-inspector");

const DEFAULT_SRV_DESTINATION = "srv-api";

module.exports = class DataInspectorBuildPlugin extends cds.build.Plugin {
  /**
   * Auto-detect whether this build task should run.
   * Always returns true — the UI5 app should be built whenever the plugin is installed.
   * The destination patching applies to both CF (MTA) and Kyma deployments,
   * as both use the approuter with xs-app.json destination routing.
   */
  static hasTask() {
    return true;
  }

  static taskDefaults = {
    src: ".",
    dest: "cap-js-data-inspector-ui",
  };

  init() {
    // Build output goes to gen/cap-js-data-inspector-ui
    this.task.dest = join(
      cds.root,
      cds.env.build.target !== "." ? cds.env.build.target : "gen",
      "cap-js-data-inspector-ui"
    );
  }

  async build() {
    // Resolve the source UI5 app path from the plugin's own package
    const uiAppSrc = this.resolveUiAppSource();
    if (!uiAppSrc) {
      log.warn("Could not locate data-inspector UI5 app source, skipping build task");
      return;
    }

    // Copy the UI5 app to build output
    await this.copy(uiAppSrc).to(this.task.dest);

    // Determine and apply destination
    const destination = await this.resolveDestination();
    if (destination !== DEFAULT_SRV_DESTINATION) {
      await this.patchXsAppDestination(destination);
      log.info(`Patched xs-app.json destination to '${destination}'`);
    } else {
      log.debug(`Using default destination '${DEFAULT_SRV_DESTINATION}'`);
    }
  }

  /**
   * Resolve the UI5 app source directory.
   * Looks for the app within the data-inspector package.
   */
  private resolveUiAppSource(): string | null {
    // __dirname is lib/ at runtime, so the app is at ../app/data-inspector-ui
    const appPath = join(__dirname, "..", "app", "data-inspector-ui");
    if (exists(appPath)) return appPath;

    // Fallback: check node_modules
    const nmPath = join(
      cds.root,
      "node_modules",
      "@cap-js",
      "data-inspector",
      "app",
      "data-inspector-ui"
    );
    if (exists(nmPath)) return nmPath;

    return null;
  }

  /**
   * Resolve the backend destination name.
   * Priority:
   * 1. cds.env.data_inspector.destination (explicit configuration)
   * 2. Auto-detect from existing UI5 apps' xs-app.json
   * 3. Default: "srv-api"
   */
  private async resolveDestination(): Promise<string> {
    // 1. Check cds.env configuration
    const configDestination = cds.env.data_inspector?.destination;
    if (configDestination) {
      log.debug(`Using configured destination '${configDestination}' from cds.env`);
      return configDestination;
    }

    // 2. Auto-detect from existing UI5 apps
    const detected = await this.detectDestinationFromApps();
    if (detected) {
      log.debug(`Auto-detected destination '${detected}' from existing UI5 app`);
      return detected;
    }

    // 3. Default
    return DEFAULT_SRV_DESTINATION;
  }

  /**
   * Auto-detect the destination name from existing UI5 apps in the project.
   * Scans for xs-app.json files in common UI5 app locations and reads
   * the destination from OData routes.
   */
  private async detectDestinationFromApps(): Promise<string | null> {
    // Common locations where UI5 apps are found in CAP projects
    const appDirs = ["app", "apps"];

    for (const appDir of appDirs) {
      const appDirPath = join(cds.root, appDir);
      if (!exists(appDirPath)) continue;

      try {
        const entries = require("fs").readdirSync(appDirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          // Skip the data-inspector's own UI app
          if (entry.name === "data-inspector-ui") continue;

          const xsAppPath = join(appDirPath, entry.name, "xs-app.json");
          if (!exists(xsAppPath)) continue;

          try {
            const xsApp = JSON.parse(require("fs").readFileSync(xsAppPath, "utf8"));
            const odataRoute = xsApp.routes?.find(
              (r: any) =>
                r.destination &&
                r.destination !== "html5-apps-repo-rt" &&
                (r.source?.includes("odata") || r.source?.includes("api"))
            );
            if (odataRoute?.destination) {
              return odataRoute.destination;
            }
          } catch {
            // Skip unreadable xs-app.json
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    }

    return null;
  }

  /**
   * Patch the xs-app.json in the build output with the correct destination name.
   */
  private async patchXsAppDestination(destination: string): Promise<void> {
    const xsAppPath = join(this.task.dest, "xs-app.json");
    if (!exists(xsAppPath)) {
      log.warn("xs-app.json not found in build output, cannot patch destination");
      return;
    }

    const xsApp = JSON.parse(require("fs").readFileSync(xsAppPath, "utf8"));
    let patched = false;

    for (const route of xsApp.routes || []) {
      if (route.destination && route.destination !== "html5-apps-repo-rt") {
        route.destination = destination;
        patched = true;
      }
    }

    if (patched) {
      require("fs").writeFileSync(xsAppPath, JSON.stringify(xsApp, null, 2));
    }
  }
};
