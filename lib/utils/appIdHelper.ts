/**
 * Resolution and validation of the data-inspector SAPUI5 app id
 * (`sap.app.id` / UI5 component namespace).
 */
const cds = require("@sap/cds");

const log = cds.log("data-inspector");

/** Default `sap.app.id` / namespace of the bundled UI5 app. */
export const DEFAULT_APP_ID = "sap.cap.datainspector.datainspectorui";

/** Default FLP viz id; independent of the configurable appId. */
export const DEFAULT_VIZ_ID = "datainspectorui-display";

/** Max length of a `sap.app.id` per the SAP app-descriptor schema. */
export const APP_ID_MAX_LENGTH = 70;

// Dot-separated namespace; each segment starts with a letter, then letters/digits/underscores.
const APP_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/;

export function isValidAppId(appId: string): boolean {
  return appId.length <= APP_ID_MAX_LENGTH && APP_ID_PATTERN.test(appId);
}

/**
 * Resolves `cds.data-inspector.appId`, falling back to {@link DEFAULT_APP_ID}.
 * An invalid value is rejected with a warning and falls back to the default.
 */
export function resolveAppId(): string {
  const configured = cds.env["data-inspector"]?.appId;
  if (typeof configured === "string" && configured.trim()) {
    const trimmed = configured.trim();
    if (isValidAppId(trimmed)) return trimmed;
    log.warn(
      `Invalid data-inspector appId '${trimmed}'; expected a dot-separated ` +
        `namespace (each segment starting with a letter, max ${APP_ID_MAX_LENGTH} chars). ` +
        `Falling back to '${DEFAULT_APP_ID}'.`
    );
  }
  return DEFAULT_APP_ID;
}
