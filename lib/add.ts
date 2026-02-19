const cds = require("@sap/cds-dk");

const { exists, read, write, path } = cds.utils;
const { join } = path;
const yaml = require("@sap/cds-foss").yaml;
const log = cds.log("data-inspector");

// Constants for data inspector catalog and group configuration
const DATA_INSPECTOR_CATALOG_ID = "capDataInspectorCatalogId";
const DATA_INSPECTOR_GROUP_ID = "capDataInspectorGroupId";
const DATA_INSPECTOR_APP_ID = "sap.cap.datainspector.datainspectorui";
const DATA_INSPECTOR_VIZ_ID = "datainspectorui-display";
const DATA_INSPECTOR_I18N_FILE = "i18n/capDataInspector.properties";
const DATA_INSPECTOR_MTA_MODULE_NAME = "capjsdatainspectorapp";

const DATA_INSPECTOR_CATALOG = {
  _version: "3.0.0",
  identification: {
    id: DATA_INSPECTOR_CATALOG_ID,
    title: "{{capDataInspectorCatalog}}",
    entityType: "catalog",
    i18n: DATA_INSPECTOR_I18N_FILE,
  },
  payload: {
    viz: [
      {
        appId: DATA_INSPECTOR_APP_ID,
        vizId: DATA_INSPECTOR_VIZ_ID,
      },
    ],
  },
};

const DATA_INSPECTOR_GROUP = {
  _version: "3.0.0",
  identification: {
    id: DATA_INSPECTOR_GROUP_ID,
    title: "{{capDataInspectorGroup}}",
    entityType: "group",
    i18n: DATA_INSPECTOR_I18N_FILE,
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
};

const DATA_INSPECTOR_I18N_CONTENT = `# Translations for CAP Data Inspector FLP integration
capDataInspectorCatalog = Data Inspector
capDataInspectorGroup = Data Inspector
`;

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

    /**
     * Add cloud portal service configuration if the host project uses it
     */
    await this.addPortalServiceConfiguration();
  }

  /**
   * Check if the host project uses cloud portal service
   * Returns true if:
   * 1. mta.yaml/mta.yml has a resource with service: portal, service-plan: standard
   * 2. flp/portal-site/CommonDataModel.json exists
   */
  async hasPortalService(): Promise<boolean> {
    // Check for CommonDataModel.json
    const cdmPath = "flp/portal-site/CommonDataModel.json";
    if (!exists(cdmPath)) {
      return false;
    }

    // Check for mta.yaml or mta.yml with portal service
    const mtaPath = exists("mta.yaml") ? "mta.yaml" : exists("mta.yml") ? "mta.yml" : null;
    if (!mtaPath) {
      return false;
    }

    try {
      const mtaContent = cds.parse.yaml(await read(mtaPath));
      const resources = mtaContent.resources || [];

      // Look for a resource with service: portal and service-plan: standard
      const hasPortalResource = resources.some(
        (resource: any) =>
          resource.parameters?.service === "portal" &&
          resource.parameters?.["service-plan"] === "standard"
      );

      return hasPortalResource;
    } catch (error) {
      log.error(`Failed to parse MTA file: ${error.message}`);
      return false;
    }
  }

  /**
   * Add portal service configuration for data inspector
   */
  async addPortalServiceConfiguration(): Promise<void> {
    const hasPortal = await this.hasPortalService();

    if (!hasPortal) {
      // Portal service not configured, skip silently
      return;
    }

    log.debug("Cloud Portal Service detected. Configuring Data Inspector FLP integration...");

    // 1. Update CommonDataModel.json
    await this.updateCommonDataModel();

    // 2. Create i18n properties file
    await this.createI18nPropertiesFile();

    // 3. Update mta.yaml
    await this.updateMtaYaml();

    log.debug("Data Inspector FLP integration configured.");
  }

  /**
   * Update CommonDataModel.json with data inspector catalog and group
   */
  async updateCommonDataModel(): Promise<void> {
    const cdmPath = "flp/portal-site/CommonDataModel.json";

    try {
      // cds.utils.read auto-parses JSON files, so no need for JSON.parse
      const cdmContent = await read(cdmPath);

      // Ensure payload structure exists
      if (!cdmContent.payload) {
        cdmContent.payload = {};
      }
      if (!cdmContent.payload.catalogs) {
        cdmContent.payload.catalogs = [];
      }
      if (!cdmContent.payload.groups) {
        cdmContent.payload.groups = [];
      }

      // Check if catalog already exists
      const catalogExists = cdmContent.payload.catalogs.some(
        (catalog: any) => catalog.identification?.id === DATA_INSPECTOR_CATALOG_ID
      );

      if (!catalogExists) {
        cdmContent.payload.catalogs.push(DATA_INSPECTOR_CATALOG);
        log.debug(`Added catalog '${DATA_INSPECTOR_CATALOG_ID}' to CommonDataModel.json`);
      } else {
        log.debug(
          `Catalog '${DATA_INSPECTOR_CATALOG_ID}' already exists in CommonDataModel.json`
        );
      }

      // Check if group already exists
      const groupExists = cdmContent.payload.groups.some(
        (group: any) => group.identification?.id === DATA_INSPECTOR_GROUP_ID
      );

      if (!groupExists) {
        cdmContent.payload.groups.push(DATA_INSPECTOR_GROUP);
        log.debug(`Added group '${DATA_INSPECTOR_GROUP_ID}' to CommonDataModel.json`);
      } else {
        log.debug(`Group '${DATA_INSPECTOR_GROUP_ID}' already exists in CommonDataModel.json`);
      }

      // Write updated content
      await write(JSON.stringify(cdmContent, null, 4)).to(cdmPath);
    } catch (error) {
      log.error(`Failed to update CommonDataModel.json: ${error.message}`);
    }
  }

  /**
   * Create i18n properties file for data inspector catalog and group titles
   */
  async createI18nPropertiesFile(): Promise<void> {
    const i18nPath = join("flp/portal-site", DATA_INSPECTOR_I18N_FILE);

    if (exists(i18nPath)) {
      log.debug(`i18n file '${DATA_INSPECTOR_I18N_FILE}' already exists`);
      return;
    }

    try {
      await write(DATA_INSPECTOR_I18N_CONTENT).to(i18nPath);
      log.debug(`Created i18n file '${DATA_INSPECTOR_I18N_FILE}'`);
    } catch (error) {
      log.error(`Failed to create i18n file: ${error.message}`);
    }
  }

  /**
   * Update mta.yaml with data inspector module and content artifact
   */
  async updateMtaYaml(): Promise<void> {
    const mtaPath = exists("mta.yaml") ? "mta.yaml" : "mta.yml";

    try {
      const mtaContent = cds.parse.yaml(await read(mtaPath));

      // Ensure modules array exists
      if (!mtaContent.modules) {
        mtaContent.modules = [];
      }

      // 1. Add data inspector HTML5 module if it doesn't exist
      const moduleExists = mtaContent.modules.some(
        (module: any) => module.name === DATA_INSPECTOR_MTA_MODULE_NAME
      );

      if (!moduleExists) {
        const dataInspectorModule = {
          name: DATA_INSPECTOR_MTA_MODULE_NAME,
          type: "html5",
          path: "node_modules/@cap-js/data-inspector/app/data-inspector-ui",
          "build-parameters": {
            "build-result": "./",
            builder: "custom",
            commands: [],
            "supported-platforms": [],
          },
        };

        // Find a good position to insert (after other html5 modules or at the beginning)
        const lastHtml5ModuleIndex = mtaContent.modules.reduce(
          (lastIndex: number, module: any, index: number) =>
            module.type === "html5" ? index : lastIndex,
          -1
        );

        if (lastHtml5ModuleIndex >= 0) {
          mtaContent.modules.splice(lastHtml5ModuleIndex + 1, 0, dataInspectorModule);
        } else {
          mtaContent.modules.unshift(dataInspectorModule);
        }

        log.debug(`Added module '${DATA_INSPECTOR_MTA_MODULE_NAME}' to mta.yaml`);
      } else {
        log.debug(`Module '${DATA_INSPECTOR_MTA_MODULE_NAME}' already exists in mta.yaml`);
      }

      // 2. Add artifact to content module's build-parameters.requires
      const contentModule = mtaContent.modules.find(
        (module: any) => module.type === "com.sap.application.content" && module.path === "."
      );

      if (contentModule) {
        // Ensure build-parameters and requires exist
        if (!contentModule["build-parameters"]) {
          contentModule["build-parameters"] = {};
        }
        if (!contentModule["build-parameters"].requires) {
          contentModule["build-parameters"].requires = [];
        }

        // Check if artifact already exists
        const artifactExists = contentModule["build-parameters"].requires.some(
          (req: any) => req.name === DATA_INSPECTOR_MTA_MODULE_NAME
        );

        if (!artifactExists) {
          const artifactEntry = {
            artifacts: ["datainspectorapp.zip"],
            name: DATA_INSPECTOR_MTA_MODULE_NAME,
            "target-path": "resources/",
          };

          contentModule["build-parameters"].requires.push(artifactEntry);
          log.debug(
            `Added artifact 'datainspectorapp.zip' to content module's build-parameters`
          );
        } else {
          log.debug(
            `Artifact for '${DATA_INSPECTOR_MTA_MODULE_NAME}' already exists in content module`
          );
        }
      } else {
        log.debug(
          `Could not find content module (type: com.sap.application.content, path: .) in mta.yaml`
        );
      }

      // Write updated content
      await write(yaml.stringify(mtaContent)).to(mtaPath);
    } catch (error) {
      log.error(`Failed to update mta.yaml: ${error.message}`);
    }
  }
};
