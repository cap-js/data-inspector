/**
 * Base class for configurators that modify mta.yaml.
 *
 * Provides shared mta.yaml modification logic:
 *   - Adds the data-inspector HTML5 module via cds.add.merge()
 *   - Adds the module's ZIP artifact to the HTML5 content module's
 *     build-parameters.requires so it is included in the deployed
 *     HTML5 Application Repository content
 *
 * The content module is located by mtaHelper.findContentModule() which
 * matches the com.sap.application.content module that targets the
 * html5-apps-repo app-host resource (see mtaHelper.ts for details).
 *
 * Subclasses implement CDM-specific file handling and detection logic.
 */
const cds = require("@sap/cds-dk");
const { join } = cds.utils.path;

import { AddPluginConfigurator } from "./AddPluginConfigurator";
import { DATA_INSPECTOR_MTA_MODULE_NAME } from "../utils/constants";
import { readMta, writeMta, findContentModule, getMtaPath } from "../utils/mtaHelper";

const log = cds.log("data-inspector");

export abstract class MtaConfigurator extends AddPluginConfigurator {
  /**
   * Adds the data-inspector HTML5 module and its ZIP artifact to mta.yaml.
   *
   * Step 1 — HTML5 module:  merged idempotently via cds.add.merge() using
   *          templates/mta-html5-module.yaml.hbs.  The module points to
   *          gen/cap-js-data-inspector-ui (produced by the build plugin).
   *
   * Step 2 — Content artifact:  the module's ZIP is added to the HTML5
   *          content module's build-parameters.requires so that `mbt build`
   *          bundles it for deployment to the HTML5 Application Repository.
   */
  protected async updateMtaYaml(): Promise<void> {
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
      (req: any) => req.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );

    if (!artifactExists) {
      contentModule["build-parameters"].requires.push({
        name: DATA_INSPECTOR_MTA_MODULE_NAME,
        artifacts: ["datainspectorapp.zip"],
        "target-path": "resources/",
      });

      await writeMta(mtaContent);
      log.debug("Added artifact to content module's build-parameters");
    }
  }
}
