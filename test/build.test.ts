/**
 * Tests for CDS Build Plugin (lib/build.ts)
 * Tests UI5 app copying and destination patching during cds build.
 *
 * The build plugin operates independently of `cds add data-inspector`.
 * It only requires the plugin to be installed as a dependency.
 * hasTask() always returns true — the build task runs whenever the plugin is present.
 */
import { expect } from "chai";
import fs from "fs";
import { join } from "path";

import { TempUtil, createTestProject, createHtml5AppWithDestination } from "./helpers";

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
 * Get the OData route destination from xs-app.json
 */
function getODataDestination(xsApp: any): string | undefined {
  const route = xsApp.routes?.find((r: any) => r.destination && r.source?.includes("odata"));
  return route?.destination;
}

/**
 * Set cds.env configuration for data_inspector.destination via .cdsrc.json
 */
function setCdsrcDestination(projectFolder: string, destination: string): void {
  const cdsrcPath = join(projectFolder, ".cdsrc.json");
  let cdsrc: any = {};
  if (fs.existsSync(cdsrcPath)) {
    cdsrc = JSON.parse(fs.readFileSync(cdsrcPath, "utf8"));
  }
  cdsrc.data_inspector = cdsrc.data_inspector || {};
  cdsrc.data_inspector.destination = destination;
  fs.writeFileSync(cdsrcPath, JSON.stringify(cdsrc, null, 2));
}

/**
 * Set cds.env configuration for data_inspector.destination via package.json "cds" section.
 *
 * Both .cdsrc.json and package.json's "cds" section feed into cds.env.
 * The difference:
 * - package.json "cds": Standard place for project config, committed to repo
 * - .cdsrc.json: Standalone config file, can be used for local overrides (often in .gitignore)
 *
 * Precedence: package.json "cds" > .cdsrc.json (per CAP config resolution order)
 */
function setPackageJsonDestination(projectFolder: string, destination: string): void {
  const pkgPath = join(projectFolder, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.cds = pkg.cds || {};
  pkg.cds.data_inspector = pkg.cds.data_inspector || {};
  pkg.cds.data_inspector.destination = destination;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

describe("CDS Build Plugin", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    await tempUtil.cleanUp();
  });

  describe("build output", () => {
    it("should copy UI5 app to build output directory with default destination", async () => {
      const project = await createTestProject(tempUtil);

      // Run cds build — no cds add needed, build plugin runs independently
      runCdsBuild(project);

      // Verify build output exists
      const buildOutputPath = join(project, BUILD_OUTPUT_DIR);
      expect(fs.existsSync(buildOutputPath)).to.be.true;

      // Verify key files were copied
      expect(fs.existsSync(join(buildOutputPath, "xs-app.json"))).to.be.true;
      expect(fs.existsSync(join(buildOutputPath, "package.json"))).to.be.true;

      // Verify xs-app.json has default destination (no patching needed)
      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("srv-api");
    });
  });

  describe("destination from .cdsrc.json", () => {
    it("should patch destination when set via .cdsrc.json", async () => {
      const project = await createTestProject(tempUtil);

      setCdsrcDestination(project, "my-custom-srv-api");
      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("my-custom-srv-api");
    });

    it("should use .cdsrc.json destination over auto-detected destination", async () => {
      const project = await createTestProject(tempUtil);

      // Create an existing HTML5 app with one destination
      createHtml5AppWithDestination(project, "auto-detected-srv");

      // But configure a different destination via .cdsrc.json (should take precedence)
      setCdsrcDestination(project, "explicit-config-srv");

      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("explicit-config-srv");
    });
  });

  describe("destination from package.json cds section", () => {
    it("should patch destination when set via package.json cds section", async () => {
      const project = await createTestProject(tempUtil);

      setPackageJsonDestination(project, "pkg-json-srv-api");
      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("pkg-json-srv-api");
    });

    it("should prefer package.json over .cdsrc.json (CAP config precedence)", async () => {
      const project = await createTestProject(tempUtil);

      // Set different destinations in both config sources
      setPackageJsonDestination(project, "from-package-json");
      setCdsrcDestination(project, "from-cdsrc-json");

      runCdsBuild(project);

      // Verify package.json "cds" section takes precedence over .cdsrc.json
      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("from-package-json");
    });
  });

  describe("destination auto-detection from existing UI5 apps", () => {
    it("should auto-detect destination from existing UI5 app xs-app.json", async () => {
      const project = await createTestProject(tempUtil);

      // Create an existing HTML5 app with custom destination
      createHtml5AppWithDestination(project, "bookshop-srv");

      runCdsBuild(project);

      const xsApp = readBuildXsApp(project);
      expect(getODataDestination(xsApp)).to.equal("bookshop-srv");
    });
  });

  describe("idempotency", () => {
    it("should produce same result when build is run multiple times", async () => {
      const project = await createTestProject(tempUtil);

      setCdsrcDestination(project, "idempotent-srv");

      // Run cds build twice
      runCdsBuild(project);
      const firstRunXsApp = readBuildXsApp(project);

      runCdsBuild(project);
      const secondRunXsApp = readBuildXsApp(project);

      // Verify both runs produce the same result
      expect(getODataDestination(firstRunXsApp)).to.equal("idempotent-srv");
      expect(getODataDestination(secondRunXsApp)).to.equal("idempotent-srv");
      expect(firstRunXsApp).to.deep.equal(secondRunXsApp);
    });
  });
});
