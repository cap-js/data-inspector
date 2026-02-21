/**
 * Configurator for SAP BTP Cloud Portal Service (FLP) integration.
 * Handles:
 * - CommonDataModel.json modification (catalog and group)
 * - i18n properties file creation
 * - mta.yaml modification (HTML5 module and content artifact)
 * - Destination detection and xs-app.json patching
 */
const cds = require("@sap/cds-dk");
const { exists, read, write, path } = cds.utils;
const { join } = path;

import { BaseConfigurator } from "./base-configurator";
import {
  DATA_INSPECTOR_CATALOG_ID,
  DATA_INSPECTOR_GROUP_ID,
  DATA_INSPECTOR_I18N_FILE,
  DATA_INSPECTOR_I18N_CONTENT,
  DATA_INSPECTOR_MTA_MODULE_NAME,
  DEFAULT_SRV_DESTINATION,
} from "../utils/constants";
import {
  readMta,
  writeMta,
  hasPortalService,
  findContentModule,
  detectSrvDestination,
} from "../utils/mta-helper";

const log = cds.log("data-inspector");

export class PortalServiceConfigurator extends BaseConfigurator {
  get name(): string {
    return "Cloud Portal Service";
  }

  /**
   * Check if the host project uses cloud portal service.
   * Returns true if:
   * 1. flp/portal-site/CommonDataModel.json exists
   * 2. mta.yaml has a resource with service: portal, service-plan: standard
   */
  async canRun(): Promise<boolean> {
    // Check for CommonDataModel.json
    const cdmPath = "flp/portal-site/CommonDataModel.json";
    if (!exists(cdmPath)) {
      return false;
    }

    // Check for mta.yaml with portal service
    const mtaContent = await readMta();
    if (!mtaContent) {
      return false;
    }

    return hasPortalService(mtaContent);
  }

  /**
   * Configure data inspector for Cloud Portal Service
   */
  async run(): Promise<void> {
    // 1. Update CommonDataModel.json
    await this.updateCommonDataModel();

    // 2. Create i18n properties file
    await this.createI18nPropertiesFile();

    // 3. Update mta.yaml
    await this.updateMtaYaml();

    log.debug("Cloud Portal service configured");
  }

  /**
   * Update CommonDataModel.json with data inspector catalog and group.
   * Uses cds.add.merge() for idempotent merging.
   */
  private async updateCommonDataModel(): Promise<void> {
    const cdmPath = "flp/portal-site/CommonDataModel.json";

    try {
      await cds.add.merge(__dirname, "../../templates/CommonDataModel.json.hbs").into(cdmPath, {
        additions: [
          { in: "payload.catalogs", where: { "identification.id": DATA_INSPECTOR_CATALOG_ID } },
          { in: "payload.groups", where: { "identification.id": DATA_INSPECTOR_GROUP_ID } },
        ],
      });
      log.debug("Added data inspector catalog and group to CommonDataModel.json");
    } catch (error) {
      log.error(`Failed to update CommonDataModel.json: ${error.message}`);
    }
  }

  /**
   * Create i18n properties file for data inspector catalog and group titles
   */
  private async createI18nPropertiesFile(): Promise<void> {
    const i18nPath = join("flp/portal-site", DATA_INSPECTOR_I18N_FILE);

    if (exists(i18nPath)) {
      log.debug(`i18n file '${DATA_INSPECTOR_I18N_FILE}' already exists`);
      return;
    }

    try {
      await write(DATA_INSPECTOR_I18N_CONTENT).to(i18nPath);
      log.debug(`Created i18n file '${DATA_INSPECTOR_I18N_FILE}'`);
    } catch (error) {
      log.error(`Failed to create i18n file: ${error.message}`);
    }
  }

  /**
   * Update mta.yaml with data inspector module and content artifact.
   * 1. HTML5 module: Added via cds.add.merge() with template
   * 2. Content artifact: Added programmatically (cds.add.merge doesn't seem to support nested array paths)
   *
   * See: https://cap.cloud.sap/docs/tools/apis/cds-add#merge-from-into-file-o
   */
  private async updateMtaYaml(): Promise<void> {
    const mtaContent = await readMta();
    if (!mtaContent) return;

    // Detect destination for xs-app.json patching
    const detectedDestination = await detectSrvDestination(mtaContent);
    const needsDestinationPatch = detectedDestination !== DEFAULT_SRV_DESTINATION;

    try {
      // Step 1: Add the HTML5 module
      await cds.add
        .merge(join(__dirname, "../../templates/mta-data-inspector-module.yaml.hbs"))
        .into("mta.yaml", {
          with: {
            customDestination: needsDestinationPatch ? detectedDestination : null,
          },
          additions: [{ in: "modules", where: { name: DATA_INSPECTOR_MTA_MODULE_NAME } }],
        });

      log.debug("Added data inspector HTML5 module to mta.yaml");

      // Step 2: Add artifact to content module's build-parameters.requires
      // Note: cds.add.merge() doesn't seem to support nested array targeting for mta.yaml
      // So we add the artifact programmatically
      await this.addArtifactToContentModule();
    } catch (error) {
      log.error(`Failed to update mta.yaml: ${error.message}`);
    }
  }

  /**
   * Add the data inspector artifact to the content module's build-parameters.requires.
   * This is done programmatically because cds.add.merge() doesn't seem to support targeting
   * nested arrays within a module (e.g., modules[?name='x'].build-parameters.requires).
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
