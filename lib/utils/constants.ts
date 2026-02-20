/**
 * Constants for data inspector catalog and group configuration
 */

// Data Inspector App identifiers
export const DATA_INSPECTOR_APP_ID = "sap.cap.datainspector.datainspectorui";
export const DATA_INSPECTOR_VIZ_ID = "datainspectorui-display";

// FLP Catalog and Group IDs
export const DATA_INSPECTOR_CATALOG_ID = "capDataInspectorCatalogId";
export const DATA_INSPECTOR_GROUP_ID = "capDataInspectorGroupId";

// i18n file path (relative to flp/portal-site)
export const DATA_INSPECTOR_I18N_FILE = "i18n/capDataInspector.properties";

// MTA module name for data inspector UI5 app
export const DATA_INSPECTOR_MTA_MODULE_NAME = "capjsdatainspectorapp";

// Default CAP backend service destination
export const DEFAULT_SRV_DESTINATION = "srv-api";

// Data Inspector FLP Catalog definition
export const DATA_INSPECTOR_CATALOG = {
  _version: "3.0.0",
  identification: {
    id: DATA_INSPECTOR_CATALOG_ID,
    title: "{{capDataInspectorCatalog}}",
    entityType: "catalog",
    i18n: DATA_INSPECTOR_I18N_FILE,
  },
  payload: {
    viz: [
      {
        appId: DATA_INSPECTOR_APP_ID,
        vizId: DATA_INSPECTOR_VIZ_ID,
      },
    ],
  },
};

// Data Inspector FLP Group definition
export const DATA_INSPECTOR_GROUP = {
  _version: "3.0.0",
  identification: {
    id: DATA_INSPECTOR_GROUP_ID,
    title: "{{capDataInspectorGroup}}",
    entityType: "group",
    i18n: DATA_INSPECTOR_I18N_FILE,
  },
  payload: {
    viz: [
      {
        id: DATA_INSPECTOR_APP_ID,
        appId: DATA_INSPECTOR_APP_ID,
        vizId: DATA_INSPECTOR_VIZ_ID,
      },
    ],
  },
};

// i18n properties file content
export const DATA_INSPECTOR_I18N_CONTENT = `# Translations for CAP Data Inspector FLP integration
capDataInspectorCatalog = Data Inspector
capDataInspectorGroup = Data Inspector
`;
