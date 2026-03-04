/**
 * Configurator for SAP BTP Cloud Portal Service (FLP) integration.
 * Handles:
 * - CommonDataModel.json modification (adding catalog, group and site's groupsOrder)
 * - i18n properties file creation for catalog and group titles
 * - mta.yaml modification (if mta.yaml exists — inherited from FlpBaseConfigurator)
 *
 * Detection: Presence of flp/portal-site/CommonDataModel.json is sufficient.
 * MTA changes are conditional — only applied when mta.yaml exists.
 *
 * Destination patching (xs-app.json) is handled by the CDS build plugin (lib/build.ts).
 */
const cds = require("@sap/cds-dk");
const { exists, read, write, path } = cds.utils;
const { join } = path;

import { FlpBaseConfigurator } from "./FlpBaseConfigurator";
import {
  DATA_INSPECTOR_CATALOG_ID,
  DATA_INSPECTOR_GROUP_ID,
  DATA_INSPECTOR_I18N_FILE,
  DATA_INSPECTOR_I18N_CONTENT,
} from "../utils/constants";
import { getMtaPath } from "../utils/mtaHelper";

const log = cds.log("data-inspector");

export class PortalServiceConfigurator extends FlpBaseConfigurator {
  get name(): string {
    return "Cloud Portal Service";
  }

  /**
   * Check if the host project uses cloud portal service.
   * Returns true if flp/portal-site/CommonDataModel.json exists.
   */
  async canRun(): Promise<boolean> {
    return exists("flp/portal-site/CommonDataModel.json");
  }

  /**
   * Configure data inspector for Cloud Portal Service
   */
  async run(): Promise<void> {
    await this.updateCommonDataModel();
    await this.createI18nPropertiesFile();

    // Only update mta.yaml if it exists
    if (getMtaPath()) {
      await this.updateMtaYaml();
    }

    log.debug("Cloud Portal service configured");
  }

  /**
   * Update CommonDataModel.json with data inspector catalog and group.
   * Uses cds.add.merge() for idempotent merging.
   * Also adds the group to groupsOrder if there's exactly one site.
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

      await this.addGroupToGroupsOrder(cdmPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update CommonDataModel.json: ${message}`);
    }
  }

  /**
   * Add the data inspector group to the site's groupsOrder array.
   */
  private async addGroupToGroupsOrder(cdmPath: string): Promise<void> {
    try {
      const cdmContent = await read(cdmPath);
      const sites = cdmContent?.payload?.sites;

      if (!sites || sites.length === 0) {
        log.debug("No sites found in CommonDataModel.json");
        return;
      }

      if (sites.length > 1) {
        log.info(
          `Multiple sites found in CommonDataModel.json. ` +
            `To display the Data Inspector tile by default, manually add "${DATA_INSPECTOR_GROUP_ID}" ` +
            `to the groupsOrder array in your preferred site.`
        );
        return;
      }

      const site = sites[0];
      if (!site.payload) {
        site.payload = {};
      }
      if (!site.payload.groupsOrder) {
        site.payload.groupsOrder = [];
      }

      if (site.payload.groupsOrder.includes(DATA_INSPECTOR_GROUP_ID)) {
        log.debug("Data inspector group already in groupsOrder");
        return;
      }

      site.payload.groupsOrder.push(DATA_INSPECTOR_GROUP_ID);
      await write(JSON.stringify(cdmContent, null, 4)).to(cdmPath);
      log.debug("Added data inspector group to groupsOrder for default visibility");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update groupsOrder: ${message}`);
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
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to create i18n file: ${message}`);
    }
  }
}
