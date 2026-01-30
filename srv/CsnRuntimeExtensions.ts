import cds from "@sap/cds";
import { CDS_ELEMENTS } from "./constants";
import { EntityDefinition } from "#cds-models/DataInspectorService";
type Entity = cds.entity;

// This one is not working!!!
function getDataSource(entity: Entity): string {
  let dataSource: string = undefined;
  const srvPrefixes = cds.model.all("service").map((srv) => srv.name + ".");

  // If entity name starts with any service prefix, it's a service entity
  if (srvPrefixes.some((srvName) => entity.name.startsWith(srvName))) {
    dataSource = EntityDefinition.dataSource.Service;
  }
  // For DB: exclude entities with @cds.persistence.skip === true
  else if (entity["@cds.persistence.skip"] !== true) {
    dataSource = EntityDefinition.dataSource.Db;
  }
  // If entity is defined inside the db schema cds file and annotated with @cds.persistence.skip then return unknown
  else {
    dataSource = EntityDefinition.dataSource.Unknown;
  }
  return dataSource;
}

function getKeyElements(entity: Entity): string[] {
  // Keys could be composite - identify all key elements
  const entityKeys: string[] = [];
  Object.entries(entity.elements).forEach(
    // @ts-expect-error
    ([name, element]: [string, Element]) => {
      // @ts-expect-error
      if (element.key && !CDS_ELEMENTS.includes(name)) {
        entityKeys.push(name);
      }
    }
  );
  return entityKeys;
}

cds.extend(cds.entity).with(
  class {
    get dataSource4DataInspector() {
      // @ts-expect-error
      return (super.dataSource4DataInspector = getDataSource(this));
    }
    get keyElements4DataInspector() {
      // @ts-expect-error
      return (super.keyElements4DataInspector = getKeyElements(this));
    }
  }
);
