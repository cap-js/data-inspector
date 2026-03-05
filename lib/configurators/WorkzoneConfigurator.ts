/**
 * Configurator for SAP Build Workzone (Standard Edition) integration.
 *
 * Configures the MTA deployment descriptor for the data-inspector
 * HTML5 application module.
 *
 * Behaviour:
 *
 *   - mta.yaml:  When mta.yaml exists and contains an HTML5 content
 *     module targeting the html5-apps-repo app-host resource, the
 *     data-inspector HTML5 module and its ZIP artifact are added.
 *
 *   - cdm.json:  NOT modified.  The Workzone CDM format uses
 *     project-specific entity IDs (roles, catalogs, spaces, workpages)
 *     that cannot be safely generated.  An informational message is
 *     logged so the user can add the tile manually.
 */
const cds = require("@sap/cds-dk");

import { MtaConfigurator } from "./MtaConfigurator";
import { getMtaPath } from "../utils/mtaHelper";

const log = cds.log("data-inspector");

export class WorkzoneConfigurator extends MtaConfigurator {
  get name(): string {
    return "SAP Build Workzone";
  }

  /**
   * Returns true when mta.yaml exists — the MTA update can proceed.
   */
  async canRun(): Promise<boolean> {
    return !!getMtaPath();
  }

  async run(): Promise<void> {
    await this.updateMtaYaml();

    log.info(
      "SAP Build Workzone MTA configured. " +
        "To display the Data Inspector tile, manually add its app reference " +
        "to your cdm.json (catalog, role, and workpage/page entities)."
    );
  }
}
