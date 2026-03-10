/**
 * Tests for MtaConfigurator.
 *
 * The configurator updates mta.yaml whenever it exists, regardless of
 * whether Portal Service or Workzone is used.  It adds the data-inspector
 * HTML5 module and wires the ZIP artifact into the content module.
 */
import { expect } from "chai";
import fs from "fs";
import { join } from "path";

import {
  TempUtil,
  createTestProject,
  runCdsAddDataInspector,
  createMtaWithWorkzone,
  createMtaWithPortal,
  createMta,
  createMtaWithContentModuleNoRequires,
  createMtaWithContentModuleNoBuildParams,
  createMtaWithMultipleContentModules,
  DATA_INSPECTOR_MTA_MODULE_NAME,
} from "./helpers";

/** Read and parse mta.yaml */
function readMta(projectFolder: string): any {
  const mtaPath = join(projectFolder, "mta.yaml");
  const yaml = require("@sap/cds-dk").utils.yaml;
  return yaml.load(fs.readFileSync(mtaPath, "utf8"));
}

describe("MtaConfigurator", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    await tempUtil.cleanUp();
  });

  it("should skip when mta.yaml does not exist", async () => {
    // Project without mta.yaml — configurator should not run (no error thrown).
    const project = await createTestProject(tempUtil, { xsuaa: true });
    runCdsAddDataInspector(project);
  });

  it("should add HTML5 module when mta.yaml with workzone setup exists", async () => {
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMtaWithWorkzone(project);
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
    expect(diModule).to.not.be.undefined;

    const contentModule = mta.modules?.find(
      (m: any) => m.type === "com.sap.application.content" && m["build-parameters"]?.requires
    );
    const diArtifact = contentModule?.["build-parameters"]?.requires?.find(
      (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );
    expect(diArtifact).to.not.be.undefined;
    expect(diArtifact["target-path"]).to.equal("app-content/");
  });

  it("should add HTML5 module when mta.yaml with portal service exists", async () => {
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMtaWithPortal(project, "flp");
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
    expect(diModule).to.not.be.undefined;

    const contentModule = mta.modules?.find(
      (m: any) => m.type === "com.sap.application.content" && m["build-parameters"]?.requires
    );
    const diArtifact = contentModule?.["build-parameters"]?.requires?.find(
      (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );
    expect(diArtifact).to.not.be.undefined;
    expect(diArtifact["target-path"]).to.equal("ui5-resources/");
  });

  it("should add HTML5 module when mta.yaml exists without portal or workzone", async () => {
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMta(project);
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
    expect(diModule).to.not.be.undefined;
  });

  it("should fall back to resources/ when no existing requires have target-path", async () => {
    // The minimal mta fixture has no content module with requires,
    // so the configurator creates one from scratch and falls back to resources/
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMtaWithContentModuleNoRequires(project);
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const contentModule = mta.modules?.find(
      (m: any) => m.type === "com.sap.application.content" && m["build-parameters"]?.requires
    );
    const diArtifact = contentModule?.["build-parameters"]?.requires?.find(
      (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );
    expect(diArtifact).to.not.be.undefined;
    // No existing requires to derive target-path from → should fall back to resources/
    expect(diArtifact["target-path"]).to.equal("resources/");
  });

  it("should create build-parameters and requires when content module has no build-parameters", async () => {
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMtaWithContentModuleNoBuildParams(project);
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
    expect(diModule).to.not.be.undefined;

    // The content module originally had no build-parameters at all;
    // the configurator should have created them.
    const contentModule = mta.modules?.find(
      (m: any) => m.type === "com.sap.application.content" && m["build-parameters"]?.requires
    );
    expect(contentModule).to.not.be.undefined;
    const diArtifact = contentModule?.["build-parameters"]?.requires?.find(
      (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );
    expect(diArtifact).to.not.be.undefined;
    // No existing requires to derive target-path from → should fall back to resources/
    expect(diArtifact["target-path"]).to.equal("resources/");
  });

  it("should add artifact to the correct content module when multiple content modules exist", async () => {
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMtaWithMultipleContentModules(project);
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
    expect(diModule).to.not.be.undefined;

    // The first content module ("first-content") is the one that targets
    // html5-apps-repo with content-target: true, so the artifact should land there.
    const firstContent = mta.modules?.find((m: any) => m.name === "first-content");
    expect(firstContent).to.not.be.undefined;
    const diArtifact = firstContent?.["build-parameters"]?.requires?.find(
      (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );
    expect(diArtifact).to.not.be.undefined;
    expect(diArtifact["target-path"]).to.equal("resources/");

    // The second content module should NOT have the data-inspector artifact.
    const secondContent = mta.modules?.find((m: any) => m.name === "second-content");
    expect(secondContent).to.not.be.undefined;
    const diArtifactInSecond = secondContent?.["build-parameters"]?.requires?.find(
      (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );
    expect(diArtifactInSecond).to.be.undefined;
  });
});
