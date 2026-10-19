/**
 * Resolution of the data-inspector UI build output folder.
 */
const cds = require("@sap/cds");

/** Fixed name of the generated UI folder. */
export const UI_BUILD_FOLDER_NAME = "cap-data-inspector-ui";

/**
 * Resolves the parent folder of the generated UI:
 *   1. cds.data-inspector.uiBuildTargetFolder (explicit config)
 *   2. cds.env.build.target (when not ".")
 *   3. "gen" (default)
 */
export function resolveUiBuildParentFolder(): string {
  const configured = cds.env["data-inspector"]?.uiBuildTargetFolder;
  if (typeof configured === "string" && configured.trim()) return configured.trim();
  if (cds.env.build.target !== ".") return cds.env.build.target;
  return "gen";
}

/**
 * Relative, forward-slash path of the generated UI (e.g. "gen/cap-data-inspector-ui"
 * or "app/cap-data-inspector-ui"). Used for the mta.yaml html5 module path.
 */
export function resolveUiBuildPath(): string {
  return `${resolveUiBuildParentFolder()}/${UI_BUILD_FOLDER_NAME}`;
}
