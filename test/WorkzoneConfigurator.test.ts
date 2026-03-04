/**
 * Tests for WorkzoneConfigurator
 * Tests SAP Build Workzone integration: cdm.json and mta.yaml modifications.
 */
import { expect } from "chai";

import {
  TempUtil,
  createTestProject,
  runCdsAddDataInspector,
  createMtaWithWorkzone,
  createMtaWithoutPortal,
  createWorkzoneCdm,
  createEmptyWorkzoneCdm,
  readWorkzoneCdm,
  readMta,
  DATA_INSPECTOR_GROUP_ID,
  DATA_INSPECTOR_APP_ID,
  DATA_INSPECTOR_VIZ_ID,
  DATA_INSPECTOR_MTA_MODULE_NAME,
} from "./helpers";

describe("WorkzoneConfigurator", () => {
  const tempUtil = new TempUtil();

  after(async () => {
    await tempUtil.cleanUp();
  });

  describe("detection", () => {
    it("should not configure workzone when cdm.json does not exist", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Set up mta.yaml with workzone service but no cdm.json file
      createMtaWithWorkzone(project);

      runCdsAddDataInspector(project);

      // mta.yaml should NOT have the data inspector module (workzone configurator didn't run)
      const mta = readMta(project);
      const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
      expect(diModule).to.be.undefined;
    });

    it("should configure CDM and MTA when mta.yaml has no workzone service", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      // Set up cdm.json but mta.yaml without workzone service
      createMtaWithoutPortal(project);
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);

      // cdm.json SHOULD have the data inspector group (cdm.json existence is sufficient)
      const cdm = readWorkzoneCdm(project);
      const diGroup = cdm.find((e: any) => e.identification?.id === DATA_INSPECTOR_GROUP_ID);
      expect(diGroup).to.not.be.undefined;

      // MTA should also be updated since mta.yaml exists
      const mta = readMta(project);
      const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
      expect(diModule).to.not.be.undefined;
    });

    it("should configure CDM but skip MTA when mta.yaml does not exist", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true });

      // Set up cdm.json without mta.yaml
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);

      // cdm.json SHOULD have the data inspector group
      const cdm = readWorkzoneCdm(project);
      const diGroup = cdm.find((e: any) => e.identification?.id === DATA_INSPECTOR_GROUP_ID);
      expect(diGroup).to.not.be.undefined;
    });
  });

  describe("cdm.json modification", () => {
    it("should add group to cdm.json when workzone is configured", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithWorkzone(project);
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);

      const cdm = readWorkzoneCdm(project);

      // Should have the original group + data inspector group
      expect(cdm.length).to.equal(2);

      const diGroup = cdm.find((e: any) => e.identification?.id === DATA_INSPECTOR_GROUP_ID);
      expect(diGroup).to.not.be.undefined;
      expect(diGroup.identification.entityType).to.equal("group");
      expect(diGroup.payload.viz).to.have.lengthOf(1);
      expect(diGroup.payload.viz[0].appId).to.equal(DATA_INSPECTOR_APP_ID);
      expect(diGroup.payload.viz[0].vizId).to.equal(DATA_INSPECTOR_VIZ_ID);
    });

    it("should include inline texts in the group entry", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithWorkzone(project);
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);

      const cdm = readWorkzoneCdm(project);
      const diGroup = cdm.find((e: any) => e.identification?.id === DATA_INSPECTOR_GROUP_ID);

      // Workzone CDM uses inline texts, not external i18n files
      expect(diGroup.texts).to.be.an("array");
      expect(diGroup.texts.length).to.be.at.least(2);

      const defaultText = diGroup.texts.find((t: any) => t.locale === "");
      expect(defaultText.textDictionary.title).to.equal("Data Inspector");

      const enText = diGroup.texts.find((t: any) => t.locale === "en");
      expect(enText.textDictionary.title).to.equal("Data Inspector");
    });

    it("should not duplicate group when run multiple times", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithWorkzone(project);
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

      const cdm = readWorkzoneCdm(project);

      // Should still have exactly 2 entries (original + data inspector)
      expect(cdm.length).to.equal(2);

      const diGroups = cdm.filter((e: any) => e.identification?.id === DATA_INSPECTOR_GROUP_ID);
      expect(diGroups).to.have.lengthOf(1);
    });

    it("should preserve existing entries in cdm.json", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithWorkzone(project);
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);

      const cdm = readWorkzoneCdm(project);

      // Original entry should still exist
      const existingGroup = cdm.find((e: any) => e.identification?.id === "existingGroupId");
      expect(existingGroup).to.not.be.undefined;
      expect(existingGroup.payload.viz[0].appId).to.equal("existingApp");
    });

    it("should add group to empty cdm.json array", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithWorkzone(project);
      createEmptyWorkzoneCdm(project);

      runCdsAddDataInspector(project);

      const cdm = readWorkzoneCdm(project);
      expect(cdm.length).to.equal(1);
      expect(cdm[0].identification.id).to.equal(DATA_INSPECTOR_GROUP_ID);
    });
  });

  describe("mta.yaml modification", () => {
    it("should add HTML5 module for data inspector", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithWorkzone(project);
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);

      const mta = readMta(project);
      const diModule = mta.modules?.find((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);

      expect(diModule).to.not.be.undefined;
      expect(diModule.type).to.equal("html5");
    });

    it("should add artifact to content module", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithWorkzone(project);
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);

      const mta = readMta(project);
      const contentModule = mta.modules?.find(
        (m: any) => m.type === "com.sap.application.content" && m.path === "."
      );

      const diArtifact = contentModule?.["build-parameters"]?.requires?.find(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(diArtifact).to.not.be.undefined;
      expect(diArtifact.artifacts).to.include("datainspectorapp.zip");
    });

    it("should not duplicate module and artifact when run multiple times", async () => {
      const project = await createTestProject(tempUtil, { xsuaa: true, mta: true });

      createMtaWithWorkzone(project);
      createWorkzoneCdm(project);

      runCdsAddDataInspector(project);
      runCdsAddDataInspector(project);

      const mta = readMta(project);

      // Module should not be duplicated
      const diModules = mta.modules?.filter((m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME);
      expect(diModules).to.have.lengthOf(1);

      // Artifact should not be duplicated
      const contentModule = mta.modules?.find(
        (m: any) => m.type === "com.sap.application.content" && m.path === "."
      );
      const diArtifacts = contentModule?.["build-parameters"]?.requires?.filter(
        (r: any) => r.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );
      expect(diArtifacts).to.have.lengthOf(1);
    });
  });
});
