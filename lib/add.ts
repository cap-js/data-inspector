import cds from "@sap/cds-dk";

const { path, read, exists } = cds.utils;
const { join } = path;

module.exports = class DataInspectorAddPlugin extends cds.add.Plugin {
  options() {
    return {
      "app-content-name": {
        type: "string",
        help: "Given name of your MTA module com.sap.application.content",
      },
    };
  }

  async run() {
    /**
     * Add xsuaa scope to xs-security.json
     */

    // hasXsuaa may not be reliable; directly check for the existence of xs-security.json
    if (exists("xs-security.json")) {
      await cds.add.merge(__dirname, "../templates/xs-security.json.hbs").into("xs-security.json");
    }
  }
};
