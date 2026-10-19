/**
 * Resolution of the data-inspector UI build output folder.
 */
const cds = require("@sap/cds");

const log = cds.log("data-inspector");

/** Fixed name of the generated UI folder. */
export const UI_BUILD_FOLDER_NAME = "cap-data-inspector-ui";

/**
 * A valid path segment: letters, digits, `.`, `_`, `-` — excluding `.` and
 * `..`. This blocks path traversal, absolute paths, and YAML-unsafe characters
 * (whitespace, newlines, `:`, `#`, quotes, …).
 */
const PATH_SEGMENT_PATTERN = /^(?!\.{1,2}$)[a-zA-Z0-9._-]+$/;

/** Returns true when `folder` is a safe, relative `/`-separated path. */
function isValidUiBuildTargetFolder(folder: string): boolean {
  return folder.split("/").every((segment) => PATH_SEGMENT_PATTERN.test(segment));
}

/**
 * Resolves the parent folder of the generated UI:
 *   1. cds.data-inspector.uiBuildTargetFolder (explicit config, must be valid)
 *   2. cds.env.build.target (when not ".")
 *   3. "gen" (default)
 *
 * A configured value that is not a safe relative path is rejected with a
 * warning and falls back to the CDS build target.
 */
export function resolveUiBuildParentFolder(): string {
  const configured = cds.env["data-inspector"]?.uiBuildTargetFolder;
  if (typeof configured === "string" && configured.trim()) {
    const normalized = configured.trim().replace(/\\/g, "/");
    if (isValidUiBuildTargetFolder(normalized)) return normalized;
    log.warn(
      `Invalid data-inspector uiBuildTargetFolder '${configured}'; expected a relative ` +
        `path (segments of letters/digits/._-, no '..' or absolute paths). ` +
        `Falling back to the CDS build target.`
    );
  }
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
