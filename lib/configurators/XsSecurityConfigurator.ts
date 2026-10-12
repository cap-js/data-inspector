/**
 * Configurator for xs-security.json scope management.
 * Adds the data-inspector readonly scope to the host project's xs-security.json.
 */
const cds = require("@sap/cds");
const { exists, read, write } = cds.utils;

import { AddPluginConfigurator } from "./AddPluginConfigurator";

const log = cds.log("data-inspector");

/** The scope name written into xs-security.json. */
const DATA_INSPECTOR_SCOPE_NAME = "$XSAPPNAME.capDataInspectorReadonly";
const DATA_INSPECTOR_SCOPE_DESCRIPTION = "Read access for @cap-js/data-inspector";

export class XsSecurityConfigurator extends AddPluginConfigurator {
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
   * Add the data-inspector scope to xs-security.json (idempotent).
   */
  async run(): Promise<void> {
    const filePath = "xs-security.json";
    try {
      const xsSecurity = await read(filePath);

      // safety net
      if (!Array.isArray(xsSecurity.scopes)) {
        xsSecurity.scopes = [];
      }

      const alreadyPresent = xsSecurity.scopes.some(
        (s: { name?: string }) => s?.name === DATA_INSPECTOR_SCOPE_NAME
      );
      if (alreadyPresent) {
        return;
      }

      xsSecurity.scopes.push({
        name: DATA_INSPECTOR_SCOPE_NAME,
        description: DATA_INSPECTOR_SCOPE_DESCRIPTION,
      });

      await write(JSON.stringify(xsSecurity, null, 2)).to(filePath);
      log.debug(`Added scope ${DATA_INSPECTOR_SCOPE_NAME} to xs-security.json`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to update xs-security.json: ${message}`);
    }
  }
}
