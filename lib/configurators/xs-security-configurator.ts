/**
 * Configurator for xs-security.json scope management.
 * Adds the data-inspector readonly scope to the host project's xs-security.json.
 */
const cds = require("@sap/cds-dk");
const { exists } = cds.utils;

import { BaseConfigurator } from "./base-configurator";

const log = cds.log("data-inspector");

export class XsSecurityConfigurator extends BaseConfigurator {
  get name(): string {
    return "xs-security.json";
  }

  /**
   * Check if xs-security.json exists.
   */
  async canRun(): Promise<boolean> {
    return exists("xs-security.json");
  }

  /**
   * Add data-inspector scope to xs-security.json using cds.add.merge
   */
  async run(): Promise<void> {
    try {
      await cds.add
        .merge(__dirname, "../../templates/xs-security.json.hbs")
        .into("xs-security.json", {
          additions: [{ in: "scopes", where: { name: "$XSAPPNAME.capDataInspectorReadonly" } }],
        });
      log.debug("Added data-inspector scope to xs-security.json");
    } catch (error) {
      log.error(`Failed to update xs-security.json: ${error.message}`);
    }
  }
}
