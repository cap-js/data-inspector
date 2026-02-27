/**
 * Export all test helpers from a single entry point
 */
export { TempUtil } from "./TempUtil";
export { createTestProject, runCdsAddDataInspector } from "./projectSetup";
export {
  readXsSecurity,
  xsSecurityExists,
  countScope,
  readCommonDataModel,
  commonDataModelExists,
  readMta,
  i18nFileExists,
  readI18nFile,
} from "./fileReaders";
export {
  createMtaWithPortal,
  createMtaWithoutPortal,
  createMtaWithCustomDestination,
  createMtaWithDefaultDestination,
  createCommonDataModel,
  createCommonDataModelWithSingleSite,
  createCommonDataModelWithMultipleSites,
  createHtml5AppWithDestination,
  createMtaWithContentModuleNoBuildParams,
  createMtaWithContentModuleNoRequires,
  createMtaWithMultipleContentModules,
} from "./mtaFixtures";

// Test constants - these values must match what's in lib/utils/constants.ts
// We define them here to avoid cross-importing between test and lib folders
export const DATA_INSPECTOR_SCOPE = "$XSAPPNAME.capDataInspectorReadonly";
export const DATA_INSPECTOR_CATALOG_ID = "capDataInspectorCatalogId";
export const DATA_INSPECTOR_GROUP_ID = "capDataInspectorGroupId";
export const DATA_INSPECTOR_MTA_MODULE_NAME = "capjsdatainspectorapp";
export const DATA_INSPECTOR_APP_ID = "sap.cap.datainspector.datainspectorui";
