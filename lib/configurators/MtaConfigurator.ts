/**
 * Configurator that updates mta.yaml for the data-inspector HTML5 module.
 *
 * Runs whenever mta.yaml exists in the project, regardless of whether
 * Portal Service or Workzone is used.
 *
 * Responsibilities:
 *   - Inserts (or updates) the data-inspector HTML5 module
 *   - Adds the module's ZIP artifact to the HTML5 content module's
 *     build-parameters.requires so it is included in the deployed
 *     HTML5 Application Repository content
 *
 * The module is upserted directly (read → modify → write) rather than via
 * cds.add.merge(), because the merge's dedup behavior varies across cds-dk
 * versions and could insert a duplicate module on re-runs. The direct upsert
 * is deterministic: it always yields exactly one module with the correct path.
 *
 * The content module is located by mtaHelper.findContentModule() which
 * matches the com.sap.application.content module that targets the
 * html5-apps-repo app-host resource (see mtaHelper.ts for details).
 */
const cds = require("@sap/cds");

import { AddPluginConfigurator } from "./AddPluginConfigurator";
import { readMta, writeMta, findContentModule, getMtaPath } from "../utils/mtaHelper";
import { resolveUiBuildPath } from "../utils/uiBuildPathHelper";

const log = cds.log("data-inspector");

const DATA_INSPECTOR_MTA_MODULE_NAME = "capdatainspectorapp";

export class MtaConfigurator extends AddPluginConfigurator {
  get name(): string {
    return "MTA";
  }

  /**
   * Returns true when mta.yaml exists — the MTA update can proceed.
   */
  async canRun(): Promise<boolean> {
    return !!getMtaPath();
  }

  /**
   * Adds the data-inspector HTML5 module and its ZIP artifact to mta.yaml.
   */
  async run(): Promise<void> {
    const mtaPath = getMtaPath();
    if (!mtaPath) return;

    try {
      await this.upsertHtml5Module();
      await this.addArtifactToContentModule();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update mta.yaml: ${message}`);
    }
  }

  /**
   * Inserts the data-inspector html5 module, or updates the existing one's
   * `path` to the resolved UI build folder.
   * If multiple entries somehow exist, the first is kept (preserving user edits)
   * and the duplicates are removed.
   */
  private async upsertHtml5Module(): Promise<void> {
    const mta = await readMta();
    if (!mta) return;

    mta.modules ??= [];
    const expectedPath = resolveUiBuildPath();

    const existing = mta.modules.filter(
      // mta.yaml modules have a dynamic structure
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => m.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );

    if (existing.length === 0) {
      mta.modules.push(this.buildHtml5Module(expectedPath));
      log.debug(`Added html5 module to mta.yaml (path '${expectedPath}')`);
    } else {
      // Keep the first (preserves user edits), set its path, drop any duplicates.
      const [keep] = existing;
      keep.path = expectedPath;
      if (existing.length > 1) {
        mta.modules = mta.modules.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m: any) => m.name !== DATA_INSPECTOR_MTA_MODULE_NAME || m === keep
        );
      }
      log.debug(`Reconciled html5 module in mta.yaml (path '${expectedPath}')`);
    }

    await writeMta(mta);
  }

  /** Builds the data-inspector html5 module entry. */
  private buildHtml5Module(uiBuildPath: string): Record<string, unknown> {
    return {
      name: DATA_INSPECTOR_MTA_MODULE_NAME,
      type: "html5",
      path: uiBuildPath,
      "build-parameters": {
        "build-result": "dist",
        builder: "custom",
        commands: ["npm install", "npm run build:cf"],
        "supported-platforms": [],
      },
    };
  }

  /**
   * Appends the data-inspector ZIP artifact to the content module's
   * build-parameters.requires array.  Creates the intermediate objects
   * (build-parameters, requires) if they don't exist yet.  Skips the
   * addition if the artifact is already present (idempotent).
   */
  private async addArtifactToContentModule(): Promise<void> {
    const mtaContent = await readMta();
    if (!mtaContent) return;

    const contentModule = findContentModule(mtaContent);
    if (!contentModule) {
      log.debug("HTML5 content module not found in mta.yaml, skipping artifact addition");
      return;
    }

    if (!contentModule["build-parameters"]) {
      contentModule["build-parameters"] = {};
    }
    if (!contentModule["build-parameters"].requires) {
      contentModule["build-parameters"].requires = [];
    }

    const artifactExists = contentModule["build-parameters"].requires.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req: any) => req.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );

    if (!artifactExists) {
      const targetPath = this.resolveTargetPath(contentModule["build-parameters"].requires);

      contentModule["build-parameters"].requires.push({
        name: DATA_INSPECTOR_MTA_MODULE_NAME,
        artifacts: ["datainspectorapp.zip"],
        "target-path": targetPath,
      });

      await writeMta(mtaContent);
      log.debug("Added artifact to content module's build-parameters");
    }
  }

  /**
   * Resolves the target-path for the new artifact entry by looking at
   * existing entries in the content module's build-parameters.requires.
   * Falls back to "resources/" if no existing entry provides a target-path.
   */
  // MTA build-parameters.requires has dynamic structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private resolveTargetPath(requires: any[]): string {
    const DEFAULT_TARGET_PATH = "resources/";

    for (const req of requires) {
      if (req["target-path"]) {
        return req["target-path"];
      }
    }

    return DEFAULT_TARGET_PATH;
  }
}
