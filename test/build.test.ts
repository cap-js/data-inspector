/**
 * Tests for CDS Build Plugin (lib/build.ts).
 *
 * The build plugin runs during `cds build` to copy the data-inspector UI5
 * app into the build output (gen/cap-data-inspector-ui) and apply
 * runtime-specific patches:
 *
 *   - xs-app.json destination:  resolved from cds.env, auto-detected
 *     from an existing UI5 app's xs-app.json, or defaults to "srv-api".
 *
 *   - xs-app.json authenticationType:  resolved from cds.env, auto-detected
 *     from an existing UI5 app's xs-app.json, or defaults to "xsuaa".
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
  createHtml5AppWithAuthType,
  createHtml5AppWithCloudService,
  cdsBin,
} from "./helpers";

const BUILD_OUTPUT_DIR = "gen/cap-data-inspector-ui";

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
 * Read a raw text file from the build output (webapp-relative path).
 */
function readBuildFile(projectFolder: string, relPath: string): string {
  return fs.readFileSync(join(projectFolder, BUILD_OUTPUT_DIR, relPath), "utf8");
}

const DEFAULT_APP_ID = "sap.cap.datainspector.datainspectorui";

/**
 * Get the OData route destination from xs-app.json
 */
function getODataDestination(xsApp: any): string | undefined {
  const route = xsApp.routes?.find((r: any) => r.destination && r.source?.includes("odata"));
  return route?.destination;
}

/**
 * Get the authenticationType of every route that declares one.
 */
function getAppRouterAuthTypes(xsApp: any): (string | undefined)[] {
  return (xsApp.routes || [])
    .filter((r: any) => r.authenticationType)
    .map((r: any) => r.authenticationType);
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
      const project = await createTestProject(tempUtil, { projectName: "build-output-default" });

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
  //  UI build target folder
  // -----------------------------------------------------------------------

  describe("uiBuildTargetFolder", () => {
    it("should build into gen/cap-data-inspector-ui by default", async () => {
      const project = await createTestProject(tempUtil, { projectName: "build-folder-default" });
      runCdsBuild(project);

      expect(
        fs.existsSync(join(project, "gen", "cap-data-inspector-ui", "webapp", "manifest.json"))
      ).to.be.true;
    });

    it("should build into the configured folder when uiBuildTargetFolder is set (e.g. app)", async () => {
      const project = await createTestProject(tempUtil, { projectName: "build-folder-custom" });
      setCdsrc(project, { uiBuildTargetFolder: "app" });
      runCdsBuild(project);

      // UI is produced under app
      const manifestPath = join(project, "app", "cap-data-inspector-ui", "webapp", "manifest.json");
      expect(fs.existsSync(manifestPath)).to.be.true;

      // Patches still apply in the custom location.
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      expect(manifest["sap.app"].id).to.equal(DEFAULT_APP_ID);
      expect(manifest["sap.app"].dataSources.mainService.uri).to.equal("/odata/v4/data-inspector/");
    });

    it("should support nested uiBuildTargetFolder paths", async () => {
      const project = await createTestProject(tempUtil, { projectName: "build-folder-nested" });
      setCdsrc(project, { uiBuildTargetFolder: "build/ui" });
      runCdsBuild(project);

      expect(
        fs.existsSync(
          join(project, "build", "ui", "cap-data-inspector-ui", "webapp", "manifest.json")
        )
      ).to.be.true;
    });

    it("should reject a path-traversal uiBuildTargetFolder and fall back to gen", async () => {
      const project = await createTestProject(tempUtil, { projectName: "build-folder-traversal" });
      setCdsrc(project, { uiBuildTargetFolder: "../escape" });
      runCdsBuild(project);

      expect(
        fs.existsSync(join(project, "gen", "cap-data-inspector-ui", "webapp", "manifest.json"))
      ).to.be.true;
    });

    it("should reject an absolute uiBuildTargetFolder and fall back to gen", async () => {
      const project = await createTestProject(tempUtil, { projectName: "build-folder-absolute" });
      setCdsrc(project, { uiBuildTargetFolder: "/abs" });
      runCdsBuild(project);

      expect(
        fs.existsSync(join(project, "gen", "cap-data-inspector-ui", "webapp", "manifest.json"))
      ).to.be.true;
    });

    it("should reject a uiBuildTargetFolder with illegal characters and fall back to gen", async () => {
      const project = await createTestProject(tempUtil, { projectName: "build-folder-illegal" });
      setCdsrc(project, { uiBuildTargetFolder: "a b" });
      runCdsBuild(project);

      expect(
        fs.existsSync(join(project, "gen", "cap-data-inspector-ui", "webapp", "manifest.json"))
      ).to.be.true;
    });

    it("should detect the host config (not the generated folder) when building into app", async () => {
      const project = await createTestProject(tempUtil, {
        projectName: "build-folder-selfdetect-dest",
      });
      // Host app declares a non-default destination.
      createHtml5AppWithDestination(project, "host-srv");
      // Host app declares ias auth on its routes.
      createHtml5AppWithAuthType(project, "ias");
      // Build the data-inspector UI into app/ (next to the host app).
      setCdsrc(project, { uiBuildTargetFolder: "app" });
      runCdsBuild(project);

      // The generated xs-app.json must pick up the HOST app's destination and auth type, not
      // the plugin default (srv-api and xsuaa) from its own freshly-copied file.
      const xsApp = JSON.parse(
        fs.readFileSync(join(project, "app", "cap-data-inspector-ui", "xs-app.json"), "utf8")
      );
      expect(getODataDestination(xsApp)).to.equal("host-srv");
      expect(getAppRouterAuthTypes(xsApp)).to.deep.equal(["ias", "ias"]);
    });
  });

  // -----------------------------------------------------------------------
  //  Destination patching
  // -----------------------------------------------------------------------

  describe("destination from .cdsrc.json", () => {
    it("should patch destination when set via .cdsrc.json", async () => {
      const project = await createTestProject(tempUtil, { projectName: "dest-cdsrc" });

      setCdsrc(project, { destination: "my-custom-srv-api" });
      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("my-custom-srv-api");
    });

    it("should use .cdsrc.json destination over auto-detected destination", async () => {
      const project = await createTestProject(tempUtil, {
        projectName: "dest-cdsrc-over-detected",
      });

      createHtml5AppWithDestination(project, "auto-detected-srv");
      setCdsrc(project, { destination: "explicit-config-srv" });

      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("explicit-config-srv");
    });
  });

  describe("destination from package.json cds section", () => {
    it("should patch destination when set via package.json cds section", async () => {
      const project = await createTestProject(tempUtil, { projectName: "dest-pkgjson" });

      setPackageJsonConfig(project, { destination: "pkg-json-srv-api" });
      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("pkg-json-srv-api");
    });

    it("should prefer package.json over .cdsrc.json (CAP config precedence)", async () => {
      const project = await createTestProject(tempUtil, { projectName: "dest-pkgjson-precedence" });

      setPackageJsonConfig(project, { destination: "from-package-json" });
      setCdsrc(project, { destination: "from-cdsrc-json" });

      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("from-package-json");
    });
  });

  describe("destination auto-detection from existing UI5 apps", () => {
    it("should auto-detect destination from existing UI5 app xs-app.json", async () => {
      const project = await createTestProject(tempUtil, { projectName: "dest-autodetect" });

      createHtml5AppWithDestination(project, "bookshop-srv");

      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("bookshop-srv");
    });
  });

  // -----------------------------------------------------------------------
  //  authenticationType patching
  // -----------------------------------------------------------------------

  describe("authenticationType default", () => {
    it("should keep xsuaa on all routes when no config and no existing app", async () => {
      const projectAuthDefault = await createTestProject(tempUtil, { projectName: "auth-default" });
      runCdsBuild(projectAuthDefault);
      const xsAppAuthDefault = readBuildXsApp(projectAuthDefault);
      // Both routes (OData + html5-apps-repo) stay xsuaa.
      expect(getAppRouterAuthTypes(xsAppAuthDefault)).to.deep.equal(["xsuaa", "xsuaa"]);
    });
  });

  describe("authenticationType from cds.env", () => {
    it("should patch all routes to ias when set via .cdsrc.json", async () => {
      const projectAuthCdsrc = await createTestProject(tempUtil, { projectName: "auth-cdsrc" });
      setCdsrc(projectAuthCdsrc, { authenticationType: "ias" });
      runCdsBuild(projectAuthCdsrc);
      const xsAppAuthCdsrc = readBuildXsApp(projectAuthCdsrc);
      expect(getAppRouterAuthTypes(xsAppAuthCdsrc)).to.deep.equal(["ias", "ias"]);
    });

    it("should patch all routes to ias when set via package.json", async () => {
      const projectAuthPkg = await createTestProject(tempUtil, { projectName: "auth-pkgjson" });
      setPackageJsonConfig(projectAuthPkg, { authenticationType: "ias" });
      runCdsBuild(projectAuthPkg);
      const xsAppAuthPkg = readBuildXsApp(projectAuthPkg);
      expect(getAppRouterAuthTypes(xsAppAuthPkg)).to.deep.equal(["ias", "ias"]);
    });

    it("should prefer cds.env authenticationType over auto-detected value", async () => {
      const projectAuthPrefer = await createTestProject(tempUtil, { projectName: "auth-prefer" });
      // Existing app declares xsuaa, but explicit config asks for ias.
      createHtml5AppWithAuthType(projectAuthPrefer, "xsuaa");
      setCdsrc(projectAuthPrefer, { authenticationType: "ias" });
      runCdsBuild(projectAuthPrefer);
      const xsAppAuthPrefer = readBuildXsApp(projectAuthPrefer);
      expect(getAppRouterAuthTypes(xsAppAuthPrefer)).to.deep.equal(["ias", "ias"]);
    });
  });

  describe("authenticationType auto-detection from existing UI5 apps", () => {
    it("should auto-detect ias from existing UI5 app xs-app.json", async () => {
      const projectAuthDetect = await createTestProject(tempUtil, {
        projectName: "auth-autodetect",
      });
      createHtml5AppWithAuthType(projectAuthDetect, "ias");
      runCdsBuild(projectAuthDetect);
      const xsAppAuthDetect = readBuildXsApp(projectAuthDetect);
      expect(getAppRouterAuthTypes(xsAppAuthDetect)).to.deep.equal(["ias", "ias"]);
    });
  });

  describe("authenticationType guardrail (never 'none')", () => {
    it("should fall back to xsuaa when 'none' is explicitly configured", async () => {
      const projectAuthNoneCfg = await createTestProject(tempUtil, {
        projectName: "auth-none-cfg",
      });
      setCdsrc(projectAuthNoneCfg, { authenticationType: "none" });
      runCdsBuild(projectAuthNoneCfg);
      const xsAppAuthNoneCfg = readBuildXsApp(projectAuthNoneCfg);
      expect(getAppRouterAuthTypes(xsAppAuthNoneCfg)).to.deep.equal(["xsuaa", "xsuaa"]);
    });

    it("should fall back to xsuaa when 'none' is auto-detected from an existing app", async () => {
      const projectAuthNoneDetect = await createTestProject(tempUtil, {
        projectName: "auth-none-detect",
      });
      createHtml5AppWithAuthType(projectAuthNoneDetect, "none");
      runCdsBuild(projectAuthNoneDetect);
      const xsAppAuthNoneDetect = readBuildXsApp(projectAuthNoneDetect);
      expect(getAppRouterAuthTypes(xsAppAuthNoneDetect)).to.deep.equal(["xsuaa", "xsuaa"]);
    });

    it("should fall back to xsuaa for an unsupported authenticationType value", async () => {
      const projectAuthBogus = await createTestProject(tempUtil, { projectName: "auth-bogus" });
      setCdsrc(projectAuthBogus, { authenticationType: "bogus" });
      runCdsBuild(projectAuthBogus);
      const xsAppAuthBogus = readBuildXsApp(projectAuthBogus);
      expect(getAppRouterAuthTypes(xsAppAuthBogus)).to.deep.equal(["xsuaa", "xsuaa"]);
    });
  });

  // -----------------------------------------------------------------------
  //  sap.cloud.service patching
  // -----------------------------------------------------------------------

  describe("sap.cloud.service from cds.env", () => {
    it("should patch manifest.json when cloudService is set via .cdsrc.json", async () => {
      const project = await createTestProject(tempUtil, { projectName: "cloud-cdsrc" });

      setCdsrc(project, { cloudService: "my.cloud.service" });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.cloud"]).to.exist;
      expect(manifest["sap.cloud"].service).to.equal("my.cloud.service");
      expect(manifest["sap.cloud"].public).to.be.true;
    });

    it("should patch manifest.json when cloudService is set via package.json", async () => {
      const project = await createTestProject(tempUtil, { projectName: "cloud-pkgjson" });

      setPackageJsonConfig(project, { cloudService: "pkg.cloud.service" });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.cloud"].service).to.equal("pkg.cloud.service");
    });

    it("should prefer cds.env cloudService over auto-detected value", async () => {
      const project = await createTestProject(tempUtil, { projectName: "cloud-prefer" });

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
      const project = await createTestProject(tempUtil, { projectName: "cloud-autodetect" });

      createHtml5AppWithCloudService(project, "detected.cloud.svc");

      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.cloud"]).to.exist;
      expect(manifest["sap.cloud"].service).to.equal("detected.cloud.svc");
    });

    it("should not patch manifest.json when no cloudService source is available", async () => {
      const project = await createTestProject(tempUtil, { projectName: "cloud-none" });

      // No cds.env config, no existing app with sap.cloud.service
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      // sap.cloud should not exist (or should not have been patched)
      expect(manifest["sap.cloud"]).to.not.exist;
    });
  });

  // -----------------------------------------------------------------------
  //  OData base path patching
  // -----------------------------------------------------------------------

  describe("OData base path patching", () => {
    /**
     * Helper: make the test project look like a Java project by adding a pom.xml.
     * Used to verify proxy URL defaults to :8080 for Java projects.
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

    it("should keep defaults when no OData base path is configured (proxy at :4004)", async () => {
      const project = await createTestProject(tempUtil, { projectName: "odata-default" });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(getMainServiceUri(manifest)).to.equal("/odata/v4/data-inspector/");

      const ui5Doc = readBuildUi5Yaml(project);
      const backend = getUi5BackendProxy(ui5Doc);
      expect(backend).to.exist;
      expect(backend!.path).to.equal("/odata");
      expect(backend!.url).to.equal("http://localhost:4004");
    });

    it("should patch all artifacts when cds.data-inspector.odataV4BasePath is set", async () => {
      const project = await createTestProject(tempUtil, { projectName: "odata-basepath" });
      setCdsrc(project, { odataV4BasePath: "/api" });
      runCdsBuild(project);

      // manifest.json: mainService.uri patched
      const manifest = readBuildManifest(project);
      expect(getMainServiceUri(manifest)).to.equal("/api/data-inspector/");

      // xs-app.json: OData route rewritten to /api
      const xsApp = readBuildXsApp(project);
      const source = getODataRouteSource(xsApp);
      expect(source).to.include("/api");
      expect(source).to.not.include("/odata");

      // ui5.yaml: path patched to /api
      const ui5Doc = readBuildUi5Yaml(project);
      const backend = getUi5BackendProxy(ui5Doc);
      expect(backend).to.exist;
      expect(backend!.path).to.equal("/api");
      expect(backend!.url).to.equal("http://localhost:4004");
    });

    it("should patch all artifacts when cds.protocols['odata-v4'].path is set (Node.js fallback)", async () => {
      const project = await createTestProject(tempUtil, { projectName: "odata-protocol-fallback" });
      const cdsrcPath = join(project, ".cdsrc.json");
      let cdsrc: any = {};
      if (fs.existsSync(cdsrcPath)) cdsrc = JSON.parse(fs.readFileSync(cdsrcPath, "utf8"));
      cdsrc.protocols = { "odata-v4": { path: "/api" } };
      fs.writeFileSync(cdsrcPath, JSON.stringify(cdsrc, null, 2));
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(getMainServiceUri(manifest)).to.equal("/api/data-inspector/");
    });

    it("should prefer odataV4BasePath over cds.protocols['odata-v4'].path when both are set", async () => {
      const project = await createTestProject(tempUtil, {
        projectName: "odata-basepath-precedence",
      });
      // odataV4BasePath should win
      const cdsrcPath = join(project, ".cdsrc.json");
      let cdsrc: any = {};
      if (fs.existsSync(cdsrcPath)) cdsrc = JSON.parse(fs.readFileSync(cdsrcPath, "utf8"));
      cdsrc["data-inspector"] = { odataV4BasePath: "/explicit" };
      cdsrc.protocols = { "odata-v4": { path: "/fallback" } };
      fs.writeFileSync(cdsrcPath, JSON.stringify(cdsrc, null, 2));
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(getMainServiceUri(manifest)).to.equal("/explicit/data-inspector/");
    });

    it("should use proxy at :8080 for Java projects (pom.xml detected)", async () => {
      const project = await createTestProject(tempUtil, { projectName: "odata-java-proxy" });
      makeJavaProject(project);
      runCdsBuild(project);

      const ui5Doc = readBuildUi5Yaml(project);
      const backend = getUi5BackendProxy(ui5Doc);
      expect(backend).to.exist;
      expect(backend!.url).to.equal("http://localhost:8080");
    });
  });

  // -----------------------------------------------------------------------
  //  appId (sap.app.id / UI5 namespace) patching
  // -----------------------------------------------------------------------

  describe("appId patching", () => {
    const CUSTOM_APP_ID = "my.company.datainspector.serviceA";

    it("should keep the default appId / namespace when appId is not configured", async () => {
      const project = await createTestProject(tempUtil, { projectName: "appid-default" });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.app"].id).to.equal(DEFAULT_APP_ID);

      // The component namespace and resource roots stay on the default id too.
      const component = readBuildFile(project, "webapp/Component.js");
      expect(component).to.include(`${DEFAULT_APP_ID}.Component`);

      const indexHtml = readBuildFile(project, "webapp/index.html");
      expect(indexHtml).to.include(DEFAULT_APP_ID);
    });

    it("should rewrite the whole namespace consistently when appId is set via .cdsrc.json", async () => {
      const project = await createTestProject(tempUtil, { projectName: "appid-cdsrc" });
      setCdsrc(project, { appId: CUSTOM_APP_ID });
      runCdsBuild(project);

      // manifest.json: sap.app.id, i18n bundleName, routing path, rootView
      const manifest = readBuildManifest(project);
      expect(manifest["sap.app"].id).to.equal(CUSTOM_APP_ID);
      expect(manifest["sap.ui5"].models.i18n.settings.bundleName).to.equal(
        `${CUSTOM_APP_ID}.i18n.i18n`
      );
      expect(manifest["sap.ui5"].routing.config.path).to.equal(`${CUSTOM_APP_ID}.view`);
      expect(manifest["sap.ui5"].rootView.viewName).to.equal(`${CUSTOM_APP_ID}.view.App`);

      // The FLP semantic object / inbound is independent of the namespace and
      // must remain unchanged so the tile intent keeps working.
      expect(manifest["sap.app"].crossNavigation.inbounds).to.have.property(
        "datainspectorui-display"
      );
      expect(
        manifest["sap.app"].crossNavigation.inbounds["datainspectorui-display"].semanticObject
      ).to.equal("datainspectorui");

      // Component.js, views, controllers, index.html and the yamls are rewritten.
      const filesToCheck = [
        "webapp/Component.js",
        "webapp/index.html",
        "webapp/controller/App.controller.js",
        "webapp/controller/dataview.controller.js",
        "webapp/view/App.view.xml",
        "ui5.yaml",
        "ui5-deploy.yaml",
      ];
      for (const rel of filesToCheck) {
        const content = readBuildFile(project, rel);
        expect(content, `${rel} should reference the custom appId`).to.include(CUSTOM_APP_ID);
        expect(content, `${rel} should not reference the default appId`).to.not.include(
          DEFAULT_APP_ID
        );
      }
    });

    it("should rewrite the namespace when appId is set via package.json cds section", async () => {
      const project = await createTestProject(tempUtil, { projectName: "appid-pkgjson" });
      setPackageJsonConfig(project, { appId: CUSTOM_APP_ID });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.app"].id).to.equal(CUSTOM_APP_ID);
    });

    it("should fall back to the default appId when the configured value is invalid (leading digit)", async () => {
      const project = await createTestProject(tempUtil, { projectName: "appid-invalid-digit" });
      setCdsrc(project, { appId: "1bad.namespace" });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.app"].id).to.equal(DEFAULT_APP_ID);
    });

    it("should fall back to the default appId when the configured value contains illegal characters", async () => {
      const project = await createTestProject(tempUtil, { projectName: "appid-invalid-chars" });
      setCdsrc(project, { appId: "has space.id" });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.app"].id).to.equal(DEFAULT_APP_ID);
    });

    it("should fall back to the default appId when the configured value exceeds the max length", async () => {
      const project = await createTestProject(tempUtil, { projectName: "appid-too-long" });
      const tooLong = "a." + "x".repeat(69); // 71 chars
      setCdsrc(project, { appId: tooLong });
      runCdsBuild(project);

      const manifest = readBuildManifest(project);
      expect(manifest["sap.app"].id).to.equal(DEFAULT_APP_ID);
    });
  });

  // -----------------------------------------------------------------------
  //  Idempotency
  // -----------------------------------------------------------------------

  describe("idempotency", () => {
    it("should produce same result when build is run multiple times", async () => {
      const project = await createTestProject(tempUtil, { projectName: "idempotency" });

      setCdsrc(project, {
        destination: "idempotent-srv",
        cloudService: "idempotent.svc",
        authenticationType: "ias",
        appId: "idempotent.datainspector.app",
      });

      runCdsBuild(project);
      const firstRunXsApp = readBuildXsApp(project);
      const firstRunManifest = readBuildManifest(project);

      runCdsBuild(project);
      const secondRunXsApp = readBuildXsApp(project);
      const secondRunManifest = readBuildManifest(project);

      expect(getODataDestination(firstRunXsApp)).to.equal("idempotent-srv");
      expect(getODataDestination(secondRunXsApp)).to.equal("idempotent-srv");
      expect(getAppRouterAuthTypes(firstRunXsApp)).to.deep.equal(["ias", "ias"]);
      expect(getAppRouterAuthTypes(secondRunXsApp)).to.deep.equal(["ias", "ias"]);
      expect(firstRunXsApp).to.deep.equal(secondRunXsApp);

      expect(firstRunManifest["sap.cloud"].service).to.equal("idempotent.svc");
      expect(secondRunManifest["sap.cloud"].service).to.equal("idempotent.svc");
      expect(firstRunManifest["sap.app"].id).to.equal("idempotent.datainspector.app");
      expect(secondRunManifest["sap.app"].id).to.equal("idempotent.datainspector.app");
      expect(firstRunManifest).to.deep.equal(secondRunManifest);
    });
  });
});
