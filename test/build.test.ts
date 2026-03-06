/**
 * Tests for CDS Build Plugin (lib/build.ts).
 *
 * The build plugin runs during `cds build` to copy the data-inspector UI5
 * app into the build output (gen/cap-js-data-inspector-ui) and apply
 * runtime-specific patches:
 *
 *   - xs-app.json destination:  resolved from cds.env, auto-detected
 *     from an existing UI5 app's xs-app.json, or defaults to "srv-api".
 *
 *   - manifest.json sap.cloud.service:  resolved from cds.env or
 *     auto-detected from an existing UI5 app's manifest.json.  When
 *     neither source provides a value the patch is skipped silently.
 *
 * The plugin operates independently of `cds add data-inspector`.
 * It only requires the plugin to be installed as a dependency.
 */
import { expect } from "chai";
import fs from "fs";
import { join } from "path";

import {
  TempUtil,
  createTestProject,
  createHtml5AppWithDestination,
  createHtml5AppWithCloudService,
} from "./helpers";

const BUILD_OUTPUT_DIR = "gen/cap-js-data-inspector-ui";

/**
 * Run cds build on a project
 */
function runCdsBuild(projectFolder: string): void {
  require("child_process").execSync(`cds build --production`, { cwd: projectFolder });
}

/**
 * Read xs-app.json from the build output
 */
function readBuildXsApp(projectFolder: string): any {
  const xsAppPath = join(projectFolder, BUILD_OUTPUT_DIR, "xs-app.json");
  return JSON.parse(fs.readFileSync(xsAppPath, "utf8"));
}

/**
 * Read manifest.json from the build output
 */
function readBuildManifest(projectFolder: string): any {
  const manifestPath = join(projectFolder, BUILD_OUTPUT_DIR, "webapp", "manifest.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

/**
 * Get the OData route destination from xs-app.json
 */
function getODataDestination(xsApp: any): string | undefined {
  const route = xsApp.routes?.find((r: any) => r.destination && r.source?.includes("odata"));
  return route?.destination;
}

/**
 * Set cds.env configuration via .cdsrc.json
 */
function setCdsrc(projectFolder: string, config: Record<string, any>): void {
  const cdsrcPath = join(projectFolder, ".cdsrc.json");
  let cdsrc: any = {};
  if (fs.existsSync(cdsrcPath)) {
    cdsrc = JSON.parse(fs.readFileSync(cdsrcPath, "utf8"));
  }
  cdsrc["data-inspector"] = { ...cdsrc["data-inspector"], ...config };
  fs.writeFileSync(cdsrcPath, JSON.stringify(cdsrc, null, 2));
}

/**
 * Set cds.env configuration via package.json "cds" section.
 *
 * Both .cdsrc.json and package.json's "cds" section feed into cds.env.
 * Precedence: package.json "cds" > .cdsrc.json (per CAP config resolution).
 */
function setPackageJsonConfig(projectFolder: string, config: Record<string, any>): void {
  const pkgPath = join(projectFolder, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.cds = pkg.cds || {};
  pkg.cds["data-inspector"] = { ...pkg.cds["data-inspector"], ...config };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

describe("CDS Build Plugin", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    await tempUtil.cleanUp();
  });

  // -----------------------------------------------------------------------
  //  Build output
  // -----------------------------------------------------------------------

  describe("build output", () => {
    it("should copy UI5 app to build output directory with default destination", async () => {
      const project = await createTestProject(tempUtil);

      runCdsBuild(project);

      const buildOutputPath = join(project, BUILD_OUTPUT_DIR);
      expect(fs.existsSync(buildOutputPath)).to.be.true;
      expect(fs.existsSync(join(buildOutputPath, "xs-app.json"))).to.be.true;
      expect(fs.existsSync(join(buildOutputPath, "package.json"))).to.be.true;

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("srv-api");
    });
  });

  // -----------------------------------------------------------------------
  //  Destination patching
  // -----------------------------------------------------------------------

  describe("destination from .cdsrc.json", () => {
    it("should patch destination when set via .cdsrc.json", async () => {
      const project = await createTestProject(tempUtil);

      setCdsrc(project, { destination: "my-custom-srv-api" });
      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("my-custom-srv-api");
    });

    it("should use .cdsrc.json destination over auto-detected destination", async () => {
      const project = await createTestProject(tempUtil);

      createHtml5AppWithDestination(project, "auto-detected-srv");
      setCdsrc(project, { destination: "explicit-config-srv" });

      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("explicit-config-srv");
    });
  });

  describe("destination from package.json cds section", () => {
    it("should patch destination when set via package.json cds section", async () => {
      const project = await createTestProject(tempUtil);

      setPackageJsonConfig(project, { destination: "pkg-json-srv-api" });
      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("pkg-json-srv-api");
    });

    it("should prefer package.json over .cdsrc.json (CAP config precedence)", async () => {
      const project = await createTestProject(tempUtil);

      setPackageJsonConfig(project, { destination: "from-package-json" });
      setCdsrc(project, { destination: "from-cdsrc-json" });

      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("from-package-json");
    });
  });

  describe("destination auto-detection from existing UI5 apps", () => {
    it("should auto-detect destination from existing UI5 app xs-app.json", async () => {
      const project = await createTestProject(tempUtil);

      createHtml5AppWithDestination(project, "bookshop-srv");

      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("bookshop-srv");
    });
  });

  // -----------------------------------------------------------------------
  //  sap.cloud.service patching
  // -----------------------------------------------------------------------

  describe("sap.cloud.service from cds.env", () => {
    it("should patch manifest.json when cloudService is set via .cdsrc.json", async () => {
      const project = await createTestProject(tempUtil);

      setCdsrc(project, { cloudService: "my.cloud.service" });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.cloud"]).to.exist;
      expect(manifest["sap.cloud"].service).to.equal("my.cloud.service");
      expect(manifest["sap.cloud"].public).to.be.true;
    });

    it("should patch manifest.json when cloudService is set via package.json", async () => {
      const project = await createTestProject(tempUtil);

      setPackageJsonConfig(project, { cloudService: "pkg.cloud.service" });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.cloud"].service).to.equal("pkg.cloud.service");
    });

    it("should prefer cds.env cloudService over auto-detected value", async () => {
      const project = await createTestProject(tempUtil);

      // Existing app has one value, cds.env has a different one.
      createHtml5AppWithCloudService(project, "auto.detected.service");
      setCdsrc(project, { cloudService: "explicit.service" });

      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.cloud"].service).to.equal("explicit.service");
    });
  });

  describe("sap.cloud.service auto-detection from existing UI5 apps", () => {
    it("should auto-detect cloudService from existing UI5 app manifest.json", async () => {
      const project = await createTestProject(tempUtil);

      createHtml5AppWithCloudService(project, "detected.cloud.svc");

      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.cloud"]).to.exist;
      expect(manifest["sap.cloud"].service).to.equal("detected.cloud.svc");
    });

    it("should not patch manifest.json when no cloudService source is available", async () => {
      const project = await createTestProject(tempUtil);

      // No cds.env config, no existing app with sap.cloud.service
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      // sap.cloud should not exist (or should not have been patched)
      expect(manifest["sap.cloud"]).to.not.exist;
    });
  });

  // -----------------------------------------------------------------------
  //  Idempotency
  // -----------------------------------------------------------------------

  describe("idempotency", () => {
    it("should produce same result when build is run multiple times", async () => {
      const project = await createTestProject(tempUtil);

      setCdsrc(project, { destination: "idempotent-srv", cloudService: "idempotent.svc" });

      runCdsBuild(project);
      const firstRunXsApp = readBuildXsApp(project);
      const firstRunManifest = readBuildManifest(project);

      runCdsBuild(project);
      const secondRunXsApp = readBuildXsApp(project);
      const secondRunManifest = readBuildManifest(project);

      expect(getODataDestination(firstRunXsApp)).to.equal("idempotent-srv");
      expect(getODataDestination(secondRunXsApp)).to.equal("idempotent-srv");
      expect(firstRunXsApp).to.deep.equal(secondRunXsApp);

      expect(firstRunManifest["sap.cloud"].service).to.equal("idempotent.svc");
      expect(secondRunManifest["sap.cloud"].service).to.equal("idempotent.svc");
      expect(firstRunManifest).to.deep.equal(secondRunManifest);
    });
  });
});
