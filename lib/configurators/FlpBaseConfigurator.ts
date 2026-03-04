/**
 * Base class for FLP configurators (Portal Service and Build Workzone).
 * Contains shared logic for:
 * - mta.yaml modification (adding HTML5 module and content module artifact)
 *
 * Subclasses implement CDM file handling and detection logic.
 */
const cds = require("@sap/cds-dk");
const { join } = cds.utils.path;

import { AddPluginConfigurator } from "./AddPluginConfigurator";
import { DATA_INSPECTOR_MTA_MODULE_NAME } from "../utils/constants";
import { readMta, writeMta, findContentModule, getMtaPath } from "../utils/mtaHelper";

const log = cds.log("data-inspector");

export abstract class FlpBaseConfigurator extends AddPluginConfigurator {
  /**
   * Update mta.yaml with data inspector module and content artifact.
   * 1. HTML5 module: Added via cds.add.merge() with template
   * 2. Content artifact: Added programmatically
   */
  protected async updateMtaYaml(): Promise<void> {
    const mtaPath = getMtaPath();
    if (!mtaPath) return;

    try {
      // Step 1: Add the HTML5 module
      await cds.add
        .merge(join(__dirname, "../../templates/mta-html5-module.yaml.hbs"))
        .into(mtaPath, {
          additions: [{ in: "modules", where: { name: DATA_INSPECTOR_MTA_MODULE_NAME } }],
        });

      log.debug("Added data inspector HTML5 module to mta.yaml");

      // Step 2: Add artifact to content module's build-parameters.requires
      await this.addArtifactToContentModule();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update mta.yaml: ${message}`);
    }
  }

  /**
   * Add the data inspector artifact to the content module's build-parameters.requires.
   */
  private async addArtifactToContentModule(): Promise<void> {
    const mtaContent = await readMta();
    if (!mtaContent) return;

    const contentModule = findContentModule(mtaContent);
    if (!contentModule) {
      log.debug("Content module not found, skipping artifact addition");
      return;
    }

    // Ensure build-parameters and requires exist
    if (!contentModule["build-parameters"]) {
      contentModule["build-parameters"] = {};
    }
    if (!contentModule["build-parameters"].requires) {
      contentModule["build-parameters"].requires = [];
    }

    // Check if artifact already exists (idempotent)
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
