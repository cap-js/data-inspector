/**
 * Tests for WorkzoneConfigurator.
 *
 * The configurator handles SAP Build Workzone integration by updating
 * mta.yaml only.  CDM (cdm.json) is NOT modified because the Workzone
 * CDM format uses project-specific entity IDs that cannot be safely
 * generated — the user must add the tile manually.
 *
 * MTA modification logic (HTML5 module addition, artifact wiring,
 * idempotency) is inherited from MtaConfigurator and already covered
 * by the PortalServiceConfigurator test suite.  This suite only
 * verifies the detection gate specific to WorkzoneConfigurator.
 */
import { expect } from "chai";

import {
  TempUtil,
  createTestProject,
  runCdsAddDataInspector,
  createMtaWithWorkzone,
  readMta,
  DATA_INSPECTOR_MTA_MODULE_NAME,
} from "./helpers";

describe("WorkzoneConfigurator", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    await tempUtil.cleanUp();
  });

  it("should skip when mta.yaml does not exist", async () => {
    // Project without mta.yaml — configurator should not run (no error thrown).
    const project = await createTestProject(tempUtil, { xsuaa: true });
    runCdsAddDataInspector(project);
  });

  it("should run when mta.yaml with workzone setup exists", async () => {
    const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });
    createMtaWithWorkzone(project);
    runCdsAddDataInspector(project);

    const mta = readMta(project);
    const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
    expect(diModule).to.not.be.undefined;
  });
});
