/**
 * Configurator for SAP Build Workzone (Standard Edition) integration.
 * Handles:
 * - workzone/cdm.json modification (adding group with data inspector viz)
 * - mta.yaml modification (if mta.yaml exists — inherited from FlpBaseConfigurator)
 *
 * Key differences from Portal Service:
 * - CDM file is a JSON array of entities (not a single object with payload)
 * - Uses inline "texts" arrays instead of external i18n .properties files
 * - Detection: Presence of workzone/cdm.json is sufficient (works for both
 *   destination-based and local-entry-point approaches)
 *
 * Destination patching (xs-app.json) and sap.cloud.service patching (manifest.json)
 * are handled by the CDS build plugin (lib/build.ts).
 */
const cds = require("@sap/cds-dk");
const { exists, read, write } = cds.utils;

import { FlpBaseConfigurator } from "./FlpBaseConfigurator";
import {
  DATA_INSPECTOR_APP_ID,
  DATA_INSPECTOR_VIZ_ID,
  DATA_INSPECTOR_GROUP_ID,
} from "../utils/constants";
import { getMtaPath } from "../utils/mtaHelper";

const log = cds.log("data-inspector");

const WORKZONE_CDM_PATH = "workzone/cdm.json";

export class WorkzoneConfigurator extends FlpBaseConfigurator {
  get name(): string {
    return "SAP Build Workzone";
  }

  /**
   * Check if the host project uses SAP Build Workzone.
   * Returns true if workzone/cdm.json exists.
   */
  async canRun(): Promise<boolean> {
    return exists(WORKZONE_CDM_PATH);
  }

  /**
   * Configure data inspector for SAP Build Workzone
   */
  async run(): Promise<void> {
    await this.updateCdmJson();

    // Only update mta.yaml if it exists
    if (getMtaPath()) {
      await this.updateMtaYaml();
    }

    log.debug("SAP Build Workzone configured");
  }

  /**
   * Update workzone/cdm.json with data inspector group entry.
   * The cdm.json is a JSON array of CDM entities. We add a group entity
   * containing the data inspector viz.
   */
  private async updateCdmJson(): Promise<void> {
    try {
      const cdmContent = await read(WORKZONE_CDM_PATH);

      if (!Array.isArray(cdmContent)) {
        log.error("workzone/cdm.json is not a JSON array, skipping CDM update");
        return;
      }

      // Check if the group already exists (idempotent)
      const existingGroup = cdmContent.find(
        (entity: any) =>
          entity.identification?.id === DATA_INSPECTOR_GROUP_ID &&
          entity.identification?.entityType === "group"
      );

      if (existingGroup) {
        log.debug("Data inspector group already exists in cdm.json");
        return;
      }

      // Add group entity with inline texts (Workzone CDM pattern)
      const groupEntity = {
        _version: "3.0",
        identification: {
          id: DATA_INSPECTOR_GROUP_ID,
          title: "{{title}}",
          entityType: "group",
        },
        payload: {
          viz: [
            {
              id: DATA_INSPECTOR_APP_ID,
              appId: DATA_INSPECTOR_APP_ID,
              vizId: DATA_INSPECTOR_VIZ_ID,
            },
          ],
        },
        texts: [
          {
            locale: "",
            textDictionary: {
              title: "Data Inspector",
            },
          },
          {
            locale: "en",
            textDictionary: {
              title: "Data Inspector",
            },
          },
        ],
      };

      cdmContent.push(groupEntity);
      await write(JSON.stringify(cdmContent, null, 2)).to(WORKZONE_CDM_PATH);
      log.debug("Added data inspector group to cdm.json");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update cdm.json: ${message}`);
    }
  }
}
