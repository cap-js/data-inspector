/**
 * CDS Add Plugin for @cap-js/data-inspector
 *
 * This plugin configures the host project to use data-inspector by:
 * 1. Adding the required XSUAA scope to xs-security.json
 * 2. Adding the HTML5 module and artifact to mta.yaml (if it exists)
 * 3. Configuring Cloud Portal Service integration (CommonDataModel.json + i18n, if detected)
 *
 * Each integration is handled by a separate configurator for maintainability.
 */
const cds = require("@sap/cds");

import {
  AddPluginConfigurator,
  XsSecurityConfigurator,
  MtaConfigurator,
  PortalServiceConfigurator,
} from "./configurators";

const log = cds.log("data-inspector");

module.exports = class DataInspectorAddPlugin extends cds.add.Plugin {
  /**
   * List of configurators to run.
   * Each configurator handles a specific integration (XSUAA, MTA, Portal Service, etc.)
   */
  private configurators: AddPluginConfigurator[] = [
    new XsSecurityConfigurator(),
    new MtaConfigurator(),
    new PortalServiceConfigurator(),
  ];

  async run() {
    // Configurators must run sequentially as they may depend on each other's state
    for (const configurator of this.configurators) {
      // eslint-disable-next-line no-await-in-loop
      if (await configurator.canRun()) {
        log.debug(`Running ${configurator.name} configurator...`);
        // eslint-disable-next-line no-await-in-loop
        await configurator.run();
      }
    }
  }
};
