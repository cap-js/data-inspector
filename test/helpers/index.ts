/**
 * Export all test helpers from a single entry point
 */
export { TempUtil } from "./TempUtil";
export { createTestProject, runCdsAddDataInspector } from "./projectSetup";
export {
  createMtaWithPortal,
  createMta,
  createCommonDataModel,
  createCommonDataModelWithSingleSite,
  createCommonDataModelWithMultipleSites,
  createHtml5AppWithDestination,
  createHtml5AppWithCloudService,
  createMtaWithContentModuleNoBuildParams,
  createMtaWithContentModuleNoRequires,
  createMtaWithMultipleContentModules,
  createMtaWithWorkzone,
} from "./fixtures";

// Test constants — must match the values in lib/utils/constants.ts
export const DATA_INSPECTOR_SCOPE = "$XSAPPNAME.capDataInspectorReadonly";
export const DATA_INSPECTOR_CATALOG_ID = "capDataInspectorCatalogId";
export const DATA_INSPECTOR_GROUP_ID = "capDataInspectorGroupId";
export const DATA_INSPECTOR_MTA_MODULE_NAME = "capjsdatainspectorapp";
export const DATA_INSPECTOR_APP_ID = "sap.cap.datainspector.datainspectorui";
