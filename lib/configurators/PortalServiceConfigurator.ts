/**
 * Configurator for SAP BTP Cloud Portal Service (FLP) integration.
 *
 * Detected by inspecting mta.yaml for an FLP deployer module — a
 * com.sap.application.content module whose requires array targets
 * a portal service resource (service: portal, service-plan: standard)
 * with content-target: true.  The deployer module's "path" property
 * gives the base directory containing portal-site/CommonDataModel.json.
 *
 * When detected, configures:
 *
 *   - CommonDataModel.json:  Adds a catalog and group entry for the
 *     data-inspector UI5 app tile.  If the CDM contains exactly one
 *     site, the group is also appended to that site's groupsOrder
 *     array so the tile is visible by default.
 *
 *   - i18n properties file:  Creates an i18n file with translatable
 *     titles for the catalog and group.
 *
 * Note: mta.yaml updates are handled separately by MtaConfigurator.
 */
const cds = require("@sap/cds");
const { exists, read, write, path } = cds.utils;
const { join } = path;

import { AddPluginConfigurator } from "./AddPluginConfigurator";
import {
  DATA_INSPECTOR_CATALOG_ID,
  DATA_INSPECTOR_GROUP_ID,
  DATA_INSPECTOR_I18N_FILE,
  DATA_INSPECTOR_I18N_CONTENT,
} from "../utils/constants";
import { readMta, findPortalDeployerPath } from "../utils/mtaHelper";

const log = cds.log("data-inspector");

export class PortalServiceConfigurator extends AddPluginConfigurator {
  /**
   * Resolved path to the portal-site directory (e.g. "flp/portal-site").
   * Set during canRun() and used by run().
   */
  private portalSitePath: string | null = null;

  get name(): string {
    return "Cloud Portal Service";
  }

  /**
   * Returns true when mta.yaml contains an FLP deployer module targeting
   * a portal service resource, and the corresponding
   * portal-site/CommonDataModel.json file exists on disk.
   */
  async canRun(): Promise<boolean> {
    const mtaContent = await readMta();
    if (!mtaContent) return false;

    const deployerPath = findPortalDeployerPath(mtaContent);
    if (!deployerPath) return false;

    const portalSitePath = join(deployerPath, "portal-site");
    const cdmPath = join(portalSitePath, "CommonDataModel.json");

    if (!exists(cdmPath)) return false;

    this.portalSitePath = portalSitePath;
    return true;
  }

  async run(): Promise<void> {
    if (!this.portalSitePath) return;

    await this.updateCommonDataModel();
    await this.createI18nPropertiesFile();

    log.debug("Cloud Portal service configured");
  }

  /**
   * Merges the data-inspector catalog and group into CommonDataModel.json
   * using cds.add.merge() for idempotent array insertion, then appends
   * the group to the site's groupsOrder when there is exactly one site.
   */
  private async updateCommonDataModel(): Promise<void> {
    const cdmPath = join(this.portalSitePath as string, "CommonDataModel.json");

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
   * Appends the data-inspector group to the site's groupsOrder so that
   * the tile appears by default in the Fiori Launchpad.
   *
   * Only applies when there is exactly one site.  With multiple sites
   * the user must manually choose which site(s) should display the tile.
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
      log.error(
        `Failed to update groupsOrder: ${message}` +
          `To display the Data Inspector tile by default, manually add "${DATA_INSPECTOR_GROUP_ID}" ` +
          `to the groupsOrder array in your preferred site.`
      );
    }
  }

  /**
   * Creates the i18n properties file with translatable titles for
   * the catalog and group entries added to CommonDataModel.json.
   * Skips creation if the file already exists (idempotent).
   */
  private async createI18nPropertiesFile(): Promise<void> {
    const i18nPath = join(this.portalSitePath as string, DATA_INSPECTOR_I18N_FILE);

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
