/**
 * CDS Build Plugin for @cap-js/data-inspector
 *
 * Copies the data-inspector UI5 app into the build output and patches
 * xs-app.json with the correct backend destination name.
 *
 * For Workzone projects, also patches manifest.json with sap.cloud.service.
 *
 * For Kyma buildpack projects (detected by app/html5-deployer/resources/),
 * additionally runs the UI5 build to produce a deployment-ready ZIP archive
 * and copies it to app/html5-deployer/resources/.
 *
 * Destination resolution order (highest to lowest priority):
 * 1. cds.env configuration: cds.data_inspector.destination
 * 2. Auto-detected from existing UI5 apps in the project
 * 3. Default: "srv-api" (standard CAP convention)
 *
 * sap.cloud.service resolution order:
 * 1. cds.env configuration: cds.data_inspector.cloudService
 * 2. Auto-detected from existing UI5 apps' manifest.json
 * 3. No default — warning logged if not found
 */
const cds = require("@sap/cds-dk");
const { exists, read, path } = cds.utils;
const { join } = path;
const { execSync } = require("child_process");
const fs = require("fs");

const log = cds.log("data-inspector");

const DEFAULT_SRV_DESTINATION = "srv-api";
const WORKZONE_CDM_PATH = "workzone/cdm.json";
const HTML5_DEPLOYER_RESOURCES_PATH = "app/html5-deployer/resources";

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

    // Patch sap.cloud.service in manifest.json for Workzone projects
    if (exists(join(cds.root, WORKZONE_CDM_PATH))) {
      const cloudService = await this.resolveCloudService();
      if (cloudService) {
        await this.patchManifestCloudService(cloudService);
        log.info(`Patched manifest.json sap.cloud.service to '${cloudService}'`);
      } else {
        log.warn(
          "Workzone detected but could not determine sap.cloud.service. " +
            "Set cds.data_inspector.cloudService in your configuration or ensure " +
            "an existing UI5 app has sap.cloud.service in its manifest.json."
        );
      }
    }

    // For Kyma buildpack: build ZIP and copy to app/html5-deployer/resources/
    const html5DeployerResources = join(cds.root, HTML5_DEPLOYER_RESOURCES_PATH);
    if (exists(html5DeployerResources)) {
      await this.buildAndCopyZip(html5DeployerResources);
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
          // Skip unreadable xs-app.json
        }
      }
    } catch {
      // Skip inaccessible directory
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

    const xsApp = JSON.parse(fs.readFileSync(xsAppPath, "utf8"));
    let patched = false;

    for (const route of xsApp.routes || []) {
      if (route.destination) {
        route.destination = destination;
        patched = true;
      }
    }

    if (patched) {
      fs.writeFileSync(xsAppPath, JSON.stringify(xsApp, null, 2));
    }
  }

  /**
   * Resolve the sap.cloud.service value for Workzone integration.
   * Priority:
   * 1. cds.env.data_inspector.cloudService (explicit configuration)
   * 2. Auto-detect from existing UI5 apps' manifest.json
   * 3. null (caller handles the warning)
   */
  private async resolveCloudService(): Promise<string | null> {
    // 1. Check cds.env configuration
    const configCloudService = cds.env.data_inspector?.cloudService;
    if (configCloudService) {
      log.debug(`Using configured cloudService '${configCloudService}' from cds.env`);
      return configCloudService;
    }

    // 2. Auto-detect from existing UI5 apps
    const detected = await this.detectCloudServiceFromApps();
    if (detected) {
      log.debug(`Auto-detected sap.cloud.service '${detected}' from existing UI5 app`);
      return detected;
    }

    // 3. Not found
    return null;
  }

  /**
   * Auto-detect the sap.cloud.service value from existing UI5 apps' manifest.json.
   * Scans app/{appName}/webapp/manifest.json for the sap.cloud.service property.
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
          if (cloudService) {
            return cloudService;
          }
        } catch {
          // Skip unreadable manifest.json
        }
      }
    } catch {
      // Skip inaccessible directory
    }

    return null;
  }

  /**
   * Patch the manifest.json in the build output with sap.cloud.service.
   */
  private async patchManifestCloudService(cloudService: string): Promise<void> {
    const manifestPath = join(this.task.dest, "webapp", "manifest.json");
    if (!exists(manifestPath)) {
      log.warn("manifest.json not found in build output, cannot patch sap.cloud.service");
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    // Add or update sap.cloud section
    manifest["sap.cloud"] = {
      public: true,
      service: cloudService,
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Build the UI5 app ZIP and copy it to app/html5-deployer/resources/.
   * This is used for Kyma buildpack deployments where the content deployer
   * expects pre-built ZIP archives in app/html5-deployer/resources/.
   *
   * Steps:
   * 1. Install dependencies in gen/ build output (npm ci)
   * 2. Run npm run build:cf to produce the ZIP via ui5-task-zipper
   * 3. Copy the resulting ZIP to app/html5-deployer/resources/
   * 4. Clean up build artifacts (node_modules, dist) in gen/
   */
  private async buildAndCopyZip(html5DeployerResources: string): Promise<void> {
    const buildDir = this.task.dest;
    const zipName = "datainspectorapp.zip"; // matches ui5-deploy.yaml archiveName + .zip

    try {
      log.info("Building data-inspector UI5 app ZIP for Kyma buildpack deployment...");

      // Step 1: Install dependencies
      log.debug(`Running npm ci in ${buildDir}`);
      execSync("npm ci", {
        cwd: buildDir,
        stdio: "pipe",
        timeout: 120000, // 2 minute timeout
      });

      // Step 2: Run build:cf to produce the ZIP
      log.debug(`Running npm run build:cf in ${buildDir}`);
      execSync("npm run build:cf", {
        cwd: buildDir,
        stdio: "pipe",
        timeout: 120000,
      });

      // Step 3: Copy ZIP to html5-deployer resources
      const zipSrc = join(buildDir, "dist", zipName);
      if (!exists(zipSrc)) {
        log.error(
          `Expected ZIP not found at ${zipSrc} after build:cf. ` +
            "Check ui5-deploy.yaml archiveName configuration."
        );
        return;
      }

      const zipDest = join(html5DeployerResources, zipName);
      fs.copyFileSync(zipSrc, zipDest);
      log.info(`Copied ${zipName} to ${HTML5_DEPLOYER_RESOURCES_PATH}/`);

      // Step 4: Clean up build artifacts in gen/ to keep output lean
      const distDir = join(buildDir, "dist");
      const nodeModulesDir = join(buildDir, "node_modules");
      if (exists(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
      }
      if (exists(nodeModulesDir)) {
        fs.rmSync(nodeModulesDir, { recursive: true, force: true });
      }
      log.debug("Cleaned up build artifacts in gen/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to build UI5 app ZIP: ${message}`);
      log.error(
        "Ensure @ui5/cli and ui5-task-zipper are available. " +
          "Check that the data-inspector UI5 app has a valid build:cf script."
      );
    }
  }
};
