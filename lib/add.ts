/**
 * CDS Add Plugin for @cap-js/data-inspector
 *
 * This plugin configures the host project to use data-inspector by:
 * 1. Adding the required XSUAA scope to xs-security.json
 * 2. Configuring Cloud Portal Service integration (if detected)
 *    - Future: SAP Build Work Zone integration
 *
 * Each integration is handled by a separate configurator for maintainability.
 */
const cds = require("@sap/cds-dk");

import {
  BaseConfigurator,
  XsSecurityConfigurator,
  PortalServiceConfigurator,
} from "./configurators";

const log = cds.log("data-inspector");

module.exports = class DataInspectorAddPlugin extends cds.add.Plugin {
  /**
   * List of configurators to run.
   * Each configurator handles a specific integration (XSUAA, Portal Service, Work Zone, etc.)
   * Order matters: XSUAA should run first as it's a prerequisite for other integrations.
   */
  private configurators: BaseConfigurator[] = [
    new XsSecurityConfigurator(),
    new PortalServiceConfigurator(),
    // Future: new WorkZoneConfigurator(),
  ];

  async run() {
    for (const configurator of this.configurators) {
      if (await configurator.canRun()) {
        log.debug(`Running ${configurator.name} configurator...`);
        await configurator.run();
      }
    }
  }
};
