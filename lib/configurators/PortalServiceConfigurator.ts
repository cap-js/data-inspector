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
import { DEFAULT_VIZ_ID, resolveAppId } from "../utils/appIdHelper";

const log = cds.log("data-inspector");

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
      this.ensureCdmArrays(cdm);

      const appId = resolveAppId();

      // Each reconcile step runs unconditionally (no short-circuit) and reports
      // whether it mutated the document; we only persist when something changed.
      let changed = false;
      changed = this.reconcileCatalog(cdm, appId) || changed;
      changed = this.reconcileGroup(cdm, appId) || changed;
      changed = this.reconcileSiteGroupsOrder(cdm) || changed;

      if (changed) {
        await write(JSON.stringify(cdm, null, 4)).to(cdmPath);
        log.debug("Added configuration to CommonDataModel.json");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update CommonDataModel.json: ${message}`);
    }
  }

  /** Ensures cdm.payload and its catalogs/groups arrays exist (safety net). */
  // CommonDataModel.json has a dynamic structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ensureCdmArrays(cdm: any): void {
    cdm.payload ??= {};
    if (!Array.isArray(cdm.payload.catalogs)) cdm.payload.catalogs = [];
    if (!Array.isArray(cdm.payload.groups)) cdm.payload.groups = [];
  }

  /**
   * Inserts the data-inspector catalog when absent, otherwise reconciles the
   * existing viz appId so a changed cds.data-inspector.appId is reflected on
   * re-runs. Malformed entries (no payload.viz[0]) are left untouched.
   * Returns true when the document was mutated.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reconcileCatalog(cdm: any, appId: string): boolean {
    const catalog = cdm.payload.catalogs.find(
      (c: { identification?: { id?: string } }) =>
        c?.identification?.id === DATA_INSPECTOR_CATALOG_ID
    );
    if (!catalog) {
      cdm.payload.catalogs.push(this.buildCatalogEntry(appId));
      return true;
    }
    const viz = catalog.payload?.viz?.[0];
    if (viz && viz.appId !== appId) {
      viz.appId = appId;
      return true;
    }
    return false;
  }

  /**
   * Inserts the data-inspector group when absent, otherwise reconciles the
   * existing viz id/appId. The vizId (FLP intent) is always left untouched.
   * Returns true when the document was mutated.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reconcileGroup(cdm: any, appId: string): boolean {
    const group = cdm.payload.groups.find(
      (g: { identification?: { id?: string } }) => g?.identification?.id === DATA_INSPECTOR_GROUP_ID
    );
    if (!group) {
      cdm.payload.groups.push(this.buildGroupEntry(appId));
      return true;
    }
    const viz = group.payload?.viz?.[0];
    if (viz && (viz.appId !== appId || viz.id !== appId)) {
      viz.id = appId;
      viz.appId = appId;
      return true;
    }
    return false;
  }

  /**
   * When the CDM has exactly one site, appends the data-inspector group to its
   * groupsOrder (idempotent). For 0 or multiple sites, logs guidance instead.
   * Returns true when the document was mutated.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reconcileSiteGroupsOrder(cdm: any): boolean {
    const sites = cdm?.payload?.sites || [];
    if (sites.length !== 1) {
      // 0 or multiple sites: the user must choose where the tile appears.
      log.info(
        `${sites.length === 0 ? "No" : "Multiple"} sites found in CommonDataModel.json. ` +
          `To display the data-inspector tile by default, manually add "${DATA_INSPECTOR_GROUP_ID}" ` +
          `to the groupsOrder array in your preferred site.`
      );
      return false;
    }

    const site = sites[0];
    site.payload ??= {};
    site.payload.groupsOrder ??= [];
    if (!site.payload.groupsOrder.includes(DATA_INSPECTOR_GROUP_ID)) {
      site.payload.groupsOrder.push(DATA_INSPECTOR_GROUP_ID);
      return true;
    }
    return false;
  }

  /**
   * Builds the catalog entry. `appId` matches the deployed app's `sap.app.id`;
   * `vizId` stays at its default (the FLP intent, independent of `appId`).
   */
  private buildCatalogEntry(appId: string): Record<string, unknown> {
    return {
      _version: CDM_ENTRY_VERSION,
      identification: {
        id: DATA_INSPECTOR_CATALOG_ID,
        title: "{{capDataInspectorCatalog}}",
        entityType: "catalog",
        i18n: DATA_INSPECTOR_I18N_FILE,
      },
      payload: {
        viz: [{ appId, vizId: DEFAULT_VIZ_ID }],
      },
    };
  }

  /** Builds the group entry. */
  private buildGroupEntry(appId: string): Record<string, unknown> {
    return {
      _version: CDM_ENTRY_VERSION,
      identification: {
        id: DATA_INSPECTOR_GROUP_ID,
        title: "{{capDataInspectorGroup}}",
        entityType: "group",
        i18n: DATA_INSPECTOR_I18N_FILE,
      },
      payload: {
        viz: [{ id: appId, appId, vizId: DEFAULT_VIZ_ID }],
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
