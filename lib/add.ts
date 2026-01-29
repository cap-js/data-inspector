const cds = require("@sap/cds-dk");

const { exists } = cds.utils;

module.exports = class DataInspectorAddPlugin extends cds.add.Plugin {
  async run() {
    /**
     * Add data-inspector scope to xs-security.json
     */
    if (exists("xs-security.json")) {
      await cds.add.merge(__dirname, "../templates/xs-security.json.hbs").into("xs-security.json", {
        additions: [{ in: "scopes", where: { name: "$XSAPPNAME.capDataInspectorReadonly" } }],
      });
    }
  }
};
