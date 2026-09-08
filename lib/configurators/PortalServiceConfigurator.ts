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
import { readMta, findPortalDeployerPath } from "../utils/mtaHelper";

const log = cds.log("data-inspector");

const DATA_INSPECTOR_APP_ID = "sap.cap.datainspector.datainspectorui";
const DATA_INSPECTOR_VIZ_ID = "datainspectorui-display";
const DATA_INSPECTOR_CATALOG_ID = "capDataInspectorCatalogId";
const DATA_INSPECTOR_GROUP_ID = "capDataInspectorGroupId";
const CDM_ENTRY_VERSION = "3.0.0";
const DATA_INSPECTOR_I18N_FILE = "i18n/capDataInspector.properties";
const DATA_INSPECTOR_I18N_CONTENT = `# Translations for CAP Data Inspector FLP integration
capDataInspectorCatalog = Data Inspector
capDataInspectorGroup = Data Inspector
`;

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
   * Adds the data-inspector catalog and group to CommonDataModel.json
   * (idempotent), then appends the group to the site's groupsOrder when
   * there is exactly one site.
   */
  private async updateCommonDataModel(): Promise<void> {
    const cdmPath = join(this.portalSitePath as string, "CommonDataModel.json");

    try {
      const cdm = await read(cdmPath);

      // safety net
      if (!cdm.payload) cdm.payload = {};
      if (!Array.isArray(cdm.payload.catalogs)) cdm.payload.catalogs = [];
      if (!Array.isArray(cdm.payload.groups)) cdm.payload.groups = [];

      let changed = false;

      const hasCatalog = cdm.payload.catalogs.some(
        (c: { identification?: { id?: string } }) =>
          c?.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );
      if (!hasCatalog) {
        cdm.payload.catalogs.push(this.buildCatalogEntry());
        changed = true;
      }

      const hasGroup = cdm.payload.groups.some(
        (g: { identification?: { id?: string } }) =>
          g?.identification?.id === DATA_INSPECTOR_GROUP_ID
      );
      if (!hasGroup) {
        cdm.payload.groups.push(this.buildGroupEntry());
        changed = true;
      }

      const sites = cdm?.payload?.sites;
      if (!sites || sites.length === 0) {
        log.info(
          "No sites found in CommonDataModel.json. " +
            `To display the data-inspector tile by default, manually add "${DATA_INSPECTOR_GROUP_ID}" ` +
            `to the groupsOrder array in a site.`
        );
      } else if (sites.length > 1) {
        log.info(
          `Multiple sites found in CommonDataModel.json. ` +
            `To display the data-inspector tile by default, manually add "${DATA_INSPECTOR_GROUP_ID}" ` +
            `to the groupsOrder array in your preferred site.`
        );
      } else {
        const site = sites[0];
        if (!site.payload) {
          site.payload = {};
        }
        if (!site.payload.groupsOrder) {
          site.payload.groupsOrder = [];
        }
        if (!site.payload.groupsOrder.includes(DATA_INSPECTOR_GROUP_ID)) {
          site.payload.groupsOrder.push(DATA_INSPECTOR_GROUP_ID);
          changed = true;
        }
      }

      if (changed) {
        await write(JSON.stringify(cdm, null, 4)).to(cdmPath);
        log.debug("Added configuration to CommonDataModel.json");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update CommonDataModel.json: ${message}`);
    }
  }

  /** Builds the catalog entry. */
  private buildCatalogEntry(): Record<string, unknown> {
    return {
      _version: CDM_ENTRY_VERSION,
      identification: {
        id: DATA_INSPECTOR_CATALOG_ID,
        title: "{{capDataInspectorCatalog}}",
        entityType: "catalog",
        i18n: DATA_INSPECTOR_I18N_FILE,
      },
      payload: {
        viz: [{ appId: DATA_INSPECTOR_APP_ID, vizId: DATA_INSPECTOR_VIZ_ID }],
      },
    };
  }

  /** Builds the group entry. */
  private buildGroupEntry(): Record<string, unknown> {
    return {
      _version: CDM_ENTRY_VERSION,
      identification: {
        id: DATA_INSPECTOR_GROUP_ID,
        title: "{{capDataInspectorGroup}}",
        entityType: "group",
        i18n: DATA_INSPECTOR_I18N_FILE,
      },
      payload: {
        viz: [
          { id: DATA_INSPECTOR_APP_ID, appId: DATA_INSPECTOR_APP_ID, vizId: DATA_INSPECTOR_VIZ_ID },
        ],
      },
    };
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
