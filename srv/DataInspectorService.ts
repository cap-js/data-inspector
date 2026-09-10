import cds from "@sap/cds";
import { EntityDefinitionReader } from "./EntityDefinitionReader";
import { DataReader } from "./DataReader";

class DataInspectorService extends cds.ApplicationService {
  init() {
    // @ts-expect-error Property 'on' does not exist on type 'DataInspectorService'.
    this.on("READ", "EntityDefinition", (req: cds.Request) => {
      const entityDefinitionReader = new EntityDefinitionReader();
      const entityDefinitions = entityDefinitionReader.read(req);
      return entityDefinitions;
    });
    // @ts-expect-error Property 'on' does not exist on type 'DataInspectorService'.
    this.on("READ", "Data", async (req: cds.Request) => {
      const dataReader = new DataReader();
      const data = await dataReader.read(req);
      return data;
    });

    return super.init();
  }
}

module.exports = { DataInspectorService };
