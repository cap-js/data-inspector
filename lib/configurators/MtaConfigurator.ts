/**
 * Configurator that updates mta.yaml for the data-inspector HTML5 module.
 *
 * Runs whenever mta.yaml exists in the project, regardless of whether
 * Portal Service or Workzone is used.
 *
 * Responsibilities:
 *   - Adds the data-inspector HTML5 module via cds.add.merge()
 *   - Adds the module's ZIP artifact to the HTML5 content module's
 *     build-parameters.requires so it is included in the deployed
 *     HTML5 Application Repository content
 *
 * The content module is located by mtaHelper.findContentModule() which
 * matches the com.sap.application.content module that targets the
 * html5-apps-repo app-host resource (see mtaHelper.ts for details).
 */
const cds = require("@sap/cds");
const { join } = cds.utils.path;

import { AddPluginConfigurator } from "./AddPluginConfigurator";
import { DATA_INSPECTOR_MTA_MODULE_NAME } from "../utils/constants";
import { readMta, writeMta, findContentModule, getMtaPath } from "../utils/mtaHelper";

const log = cds.log("data-inspector");

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
      await cds.add
        .merge(join(__dirname, "../../templates/mta-html5-module.yaml.hbs"))
        .into(mtaPath, {
          additions: [{ in: "modules", where: { name: DATA_INSPECTOR_MTA_MODULE_NAME } }],
        });

      log.debug("Added data inspector HTML5 module to mta.yaml");

      await this.addArtifactToContentModule();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update mta.yaml: ${message}`);
    }
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
