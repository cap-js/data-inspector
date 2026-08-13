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
  cdsBin,
} from "./helpers";

const BUILD_OUTPUT_DIR = "gen/cap-js-data-inspector-ui";

/**
 * Run cds build on a project
 */
function runCdsBuild(projectFolder: string): void {
  require("child_process").execSync(`${cdsBin} build --production`, { cwd: projectFolder });
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
  //  OData base path patching (Java host support)
  // -----------------------------------------------------------------------

  describe("OData base path patching", () => {
    /**
     * Helper: make the test project look like a Java project by adding a pom.xml.
     * The build task detects Java via the presence of pom.xml at project root.
     */
    function makeJavaProject(projectFolder: string): void {
      fs.writeFileSync(join(projectFolder, "pom.xml"), "<project></project>");
    }

    /**
     * Read ui5.yaml from the build output
     */
    function readBuildUi5Yaml(projectFolder: string): any {
      const YAML = require("yaml");
      const ui5Path = join(projectFolder, BUILD_OUTPUT_DIR, "ui5.yaml");
      return YAML.parse(fs.readFileSync(ui5Path, "utf8"));
    }

    function getMainServiceUri(manifest: any): string | undefined {
      return manifest?.["sap.app"]?.dataSources?.mainService?.uri;
    }

    function getODataRouteSource(xsApp: any): string | undefined {
      const route = xsApp.routes?.find((r: any) => r.destination);
      return route?.source;
    }

    function getUi5BackendProxy(ui5Doc: any): { path: string; url: string } | undefined {
      const proxy = ui5Doc?.server?.customMiddleware?.find(
        (m: any) => m?.name === "fiori-tools-proxy"
      );
      return proxy?.configuration?.backend?.[0];
    }

    it("should keep defaults for a Node.js project (no base-path patch, proxy at :4004)", async () => {
      const project = await createTestProject(tempUtil);
      runCdsBuild(project);

      // manifest.json: mainService.uri stays at the default
      const manifest = readBuildManifest(project);
      expect(getMainServiceUri(manifest)).to.equal("/odata/v4/data-inspector/");

      // ui5.yaml: proxy stays at Node.js defaults
      const ui5Doc = readBuildUi5Yaml(project);
      const backend = getUi5BackendProxy(ui5Doc);
      expect(backend).to.exist;
      expect(backend!.path).to.equal("/odata");
      expect(backend!.url).to.equal("http://localhost:4004");
    });

    it("should patch all artifacts for a Java project with odataBasePath", async () => {
      const project = await createTestProject(tempUtil);
      makeJavaProject(project);
      setCdsrc(project, { odataBasePath: "/api" });
      runCdsBuild(project);

      // manifest.json: mainService.uri patched
      const manifest = readBuildManifest(project);
      expect(getMainServiceUri(manifest)).to.equal("/api/data-inspector/");

      // xs-app.json: OData route rewritten to /api
      const xsApp = readBuildXsApp(project);
      const source = getODataRouteSource(xsApp);
      expect(source).to.include("/api");
      expect(source).to.not.include("/odata");

      // ui5.yaml: proxy defaults to Java :8080, path to /api
      const ui5Doc = readBuildUi5Yaml(project);
      const backend = getUi5BackendProxy(ui5Doc);
      expect(backend).to.exist;
      expect(backend!.path).to.equal("/api");
      expect(backend!.url).to.equal("http://localhost:8080");
    });

    it("should use explicit localServerUrl and odataBasePath from config", async () => {
      const project = await createTestProject(tempUtil);
      makeJavaProject(project);
      setCdsrc(project, { odataBasePath: "/custom-path", localServerUrl: "http://localhost:9090" });
      runCdsBuild(project);

      // manifest.json: custom base path
      const manifest = readBuildManifest(project);
      expect(getMainServiceUri(manifest)).to.equal("/custom-path/data-inspector/");

      // ui5.yaml: custom server URL and path
      const ui5Doc = readBuildUi5Yaml(project);
      const backend = getUi5BackendProxy(ui5Doc);
      expect(backend).to.exist;
      expect(backend!.path).to.equal("/custom-path");
      expect(backend!.url).to.equal("http://localhost:9090");
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
