import cds from "@sap/cds";
import { EntityDefinitionReader } from "./EntityDefinitionReader";
import { DataReader } from "./DataReader";

class DataInspectorService extends cds.ApplicationService {
  init() {
    this.on("READ", "EntityDefinition", (req: cds.Request) => {
      const entityDefinitionReader = new EntityDefinitionReader();
      const entityDefinitions = entityDefinitionReader.read(req);
      return entityDefinitions;
    });

    this.on("READ", "Data", async (req: cds.Request) => {
      const dataReader = new DataReader();
      const data = await dataReader.read(req);
      return data;
    });

    return super.init();
  }
}

module.exports = { DataInspectorService };
