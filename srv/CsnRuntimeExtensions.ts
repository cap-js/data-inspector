import cds from "@sap/cds";
import { CDS_ELEMENTS } from "./constants";
import { EntityDefinition } from "#cds-models/DataInspectorService";
type Entity = cds.entity;

// Use WeakMaps for caching computed values per entity instance
// This avoids issues with prototype chain inheritance where service entities
// (which are projections of db entities) would incorrectly share cached values
const dataSourceCache = new WeakMap<Entity, string>();
const keyElementsCache = new WeakMap<Entity, string[]>();

function getDataSource(entity: Entity): string {
  // Check cache first
  if (dataSourceCache.has(entity)) {
    return dataSourceCache.get(entity)!;
  }

  let dataSource: string;
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

  // Cache the result
  dataSourceCache.set(entity, dataSource);
  return dataSource;
}

function getKeyElements(entity: Entity): string[] {
  // Check cache first
  if (keyElementsCache.has(entity)) {
    return keyElementsCache.get(entity)!;
  }

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

  // Cache the result
  keyElementsCache.set(entity, entityKeys);
  return entityKeys;
}

cds.extend(cds.entity).with(
  class {
    get dataSource4DataInspector() {
      return getDataSource(this as unknown as Entity);
    }
    get keyElements4DataInspector() {
      return getKeyElements(this as unknown as Entity);
    }
  }
);
