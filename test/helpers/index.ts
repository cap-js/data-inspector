/**
 * Export all test helpers from a single entry point
 */
export { TempUtil } from "./temp-util";
export { createTestProject, runCdsAddDataInspector } from "./project-setup";
export {
  readXsSecurity,
  xsSecurityExists,
  countScope,
  readCommonDataModel,
  commonDataModelExists,
  readMta,
  i18nFileExists,
  readI18nFile,
} from "./file-readers";
export {
  createMtaWithPortal,
  createMtaWithoutPortal,
  createMtaWithCustomDestination,
  createMtaWithDefaultDestination,
  createCommonDataModel,
  createCommonDataModelWithSingleSite,
  createCommonDataModelWithMultipleSites,
  createHtml5AppWithDestination,
  createExistingI18nFile,
  createMtaWithContentModuleNoBuildParams,
  createMtaWithContentModuleNoRequires,
  createMtaWithNodejsProvides,
  createMtaWithMultipleContentModules,
} from "./mta-fixtures";

// Test constants - these values must match what's in lib/utils/constants.ts
// We define them here to avoid cross-importing between test and lib folders
export const DATA_INSPECTOR_SCOPE = "$XSAPPNAME.capDataInspectorReadonly";
export const DATA_INSPECTOR_CATALOG_ID = "capDataInspectorCatalogId";
export const DATA_INSPECTOR_GROUP_ID = "capDataInspectorGroupId";
export const DATA_INSPECTOR_MTA_MODULE_NAME = "capjsdatainspectorapp";
export const DATA_INSPECTOR_APP_ID = "sap.cap.datainspector.datainspectorui";
