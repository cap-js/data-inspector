/**
 * Configurator for SAP BTP Cloud Portal Service (FLP) integration.
 * Handles:
 * - CommonDataModel.json modification (catalog and group)
 * - i18n properties file creation
 * - mta.yaml modification (HTML5 module and content artifact)
 * - Destination detection and xs-app.json patching
 */
const cds = require("@sap/cds-dk");
const { exists, read, write, path } = cds.utils;
const { join } = path;

import { BaseConfigurator } from "./base-configurator";
import {
  DATA_INSPECTOR_CATALOG_ID,
  DATA_INSPECTOR_GROUP_ID,
  DATA_INSPECTOR_I18N_FILE,
  DATA_INSPECTOR_I18N_CONTENT,
  DATA_INSPECTOR_MTA_MODULE_NAME,
  DEFAULT_SRV_DESTINATION,
} from "../utils/constants";
import {
  readMta,
  writeMta,
  hasPortalService,
  findContentModule,
  detectSrvDestination,
} from "../utils/mta-helper";

const log = cds.log("data-inspector");

export class PortalServiceConfigurator extends BaseConfigurator {
  get name(): string {
    return "Cloud Portal Service";
  }

  /**
   * Check if the host project uses cloud portal service.
   * Returns true if:
   * 1. flp/portal-site/CommonDataModel.json exists
   * 2. mta.yaml has a resource with service: portal, service-plan: standard
   */
  async canRun(): Promise<boolean> {
    // Check for CommonDataModel.json
    const cdmPath = "flp/portal-site/CommonDataModel.json";
    if (!exists(cdmPath)) {
      return false;
    }

    // Check for mta.yaml with portal service
    const mtaContent = await readMta();
    if (!mtaContent) {
      return false;
    }

    return hasPortalService(mtaContent);
  }

  /**
   * Configure data inspector for Cloud Portal Service
   */
  async run(): Promise<void> {
    // 1. Update CommonDataModel.json
    await this.updateCommonDataModel();

    // 2. Create i18n properties file
    await this.createI18nPropertiesFile();

    // 3. Update mta.yaml
    await this.updateMtaYaml();

    log.debug("Cloud Portal service configured");
  }

  /**
   * Update CommonDataModel.json with data inspector catalog and group.
   * Uses cds.add.merge() for idempotent merging with nested array support.
   */
  private async updateCommonDataModel(): Promise<void> {
    const cdmPath = "flp/portal-site/CommonDataModel.json";

    try {
      await cds.add.merge(__dirname, "../../templates/CommonDataModel.json.hbs").into(cdmPath, {
        additions: [
          { in: "payload.catalogs", where: { "identification.id": DATA_INSPECTOR_CATALOG_ID } },
          { in: "payload.groups", where: { "identification.id": DATA_INSPECTOR_GROUP_ID } },
        ],
      });
      log.debug("Added data inspector catalog and group to CommonDataModel.json");
    } catch (error) {
      log.error(`Failed to update CommonDataModel.json: ${error.message}`);
    }
  }

  /**
   * Create i18n properties file for data inspector catalog and group titles
   */
  private async createI18nPropertiesFile(): Promise<void> {
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
   * Update mta.yaml with data inspector module, content artifact, and destination patch command.
   *
   * NOTE: We use programmatic manipulation instead of cds.add.merge() because cds.add.merge()
   * cannot handle the content module artifact addition. It requires:
   *
   * 1. Finding a module by TWO criteria: type="com.sap.application.content" AND path="."
   * 2. Adding to a nested array: modules[?].build-parameters.requires
   *
   * cds.add.merge() only supports simple selection like { in: "modules", where: { name: "X" } }
   * but NOT { in: "modules", where: { type: "X", path: "Y" } } or targeting nested arrays
   * within matched elements.
   *
   * Example of what we need but cannot express:
   *   { in: "modules[type=com.sap.application.content,path=.].build-parameters.requires",
   *     where: { name: "capjsdatainspectorapp" } }
   */
  private async updateMtaYaml(): Promise<void> {
    const mtaContent = await readMta();
    if (!mtaContent) return;

    // Ensure modules array exists
    if (!mtaContent.modules) {
      mtaContent.modules = [];
    }

    // Detect destination for xs-app.json patching
    const detectedDestination = await detectSrvDestination(mtaContent);
    const needsDestinationPatch = detectedDestination !== DEFAULT_SRV_DESTINATION;

    // 1. Add data inspector HTML5 module if it doesn't exist
    let dataInspectorModule = mtaContent.modules.find(
      (module: any) => module.name === DATA_INSPECTOR_MTA_MODULE_NAME
    );

    if (!dataInspectorModule) {
      // Build commands for UI5 app during MTA build
      const commands: string[] = [];

      // If destination is not default, patch xs-app.json before building
      if (needsDestinationPatch) {
        const patchCommand = `node -e "const f='xs-app.json',x=JSON.parse(require('fs').readFileSync(f));x.routes.find(r=>r.destination).destination='${detectedDestination}';require('fs').writeFileSync(f,JSON.stringify(x,null,2))"`;
        commands.push(patchCommand);
        log.debug(
          `Will patch xs-app.json destination to '${detectedDestination}' during MTA build`
        );
      }

      // Install dependencies and build the UI5 app
      commands.push("npm install");
      commands.push("npm run build:cf");

      dataInspectorModule = {
        name: DATA_INSPECTOR_MTA_MODULE_NAME,
        type: "html5",
        path: "node_modules/@cap-js/data-inspector/app/data-inspector-ui",
        "build-parameters": {
          "build-result": "dist",
          builder: "custom",
          commands,
          "supported-platforms": [],
        },
      };

      /*
       * Insert the module in a logical position within mta.yaml:
       * - If other HTML5 modules exist, insert after the last one (keeps HTML5 modules grouped)
       * - Otherwise, insert at the beginning of the modules array
       *
       * How this works:
       * 1. reduce() scans all modules, returning the index of the last HTML5 module found
       *    - Starts with -1 (no HTML5 module found yet)
       *    - For each module, if it's HTML5, remember its index; otherwise keep the previous index
       * 2. splice(index, 0, item) inserts `item` at `index` without removing anything (0 = delete count)
       * 3. unshift(item) inserts `item` at the beginning of the array
       */
      const lastHtml5ModuleIndex = mtaContent.modules.reduce(
        (lastIndex: number, module: any, index: number) =>
          module.type === "html5" ? index : lastIndex,
        -1
      );

      if (lastHtml5ModuleIndex >= 0) {
        // Insert after the last HTML5 module
        mtaContent.modules.splice(lastHtml5ModuleIndex + 1, 0, dataInspectorModule);
      } else {
        // No HTML5 modules found, insert at the beginning
        mtaContent.modules.unshift(dataInspectorModule);
      }

      log.debug(`Added module '${DATA_INSPECTOR_MTA_MODULE_NAME}' to mta.yaml`);
    } else {
      log.debug(`Module '${DATA_INSPECTOR_MTA_MODULE_NAME}' already exists in mta.yaml`);

      // Check if destination patch is needed but not yet added
      if (needsDestinationPatch) {
        if (!dataInspectorModule["build-parameters"]) {
          dataInspectorModule["build-parameters"] = {};
        }
        if (!dataInspectorModule["build-parameters"].commands) {
          dataInspectorModule["build-parameters"].commands = [];
        }

        const commands = dataInspectorModule["build-parameters"].commands;
        const patchCommandExists = commands.some(
          (cmd: string) => cmd.includes("xs-app.json") && cmd.includes("destination")
        );

        if (!patchCommandExists) {
          const patchCommand = `node -e "const f='xs-app.json',x=JSON.parse(require('fs').readFileSync(f));x.routes.find(r=>r.destination).destination='${detectedDestination}';require('fs').writeFileSync(f,JSON.stringify(x,null,2))"`;
          commands.push(patchCommand);
          log.debug(`Added destination patch command for '${detectedDestination}'`);
        }
      }
    }

    // 2. Add artifact to content module's build-parameters.requires
    const contentModule = findContentModule(mtaContent);

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
        log.debug(`Added artifact 'datainspectorapp.zip' to content module's build-parameters`);
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
    await writeMta(mtaContent);
  }
}
