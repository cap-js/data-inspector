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
  });

  it("should add HTML5 module when mta.yaml with portal service exists", async () => {
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMtaWithPortal(project, "flp");
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
    expect(diModule).to.not.be.undefined;
  });

  it("should add HTML5 module when mta.yaml exists without portal or workzone", async () => {
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMta(project);
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
    expect(diModule).to.not.be.undefined;
  });
});
