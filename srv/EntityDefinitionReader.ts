import cds from "@sap/cds";

type Element = cds.type<"type"> & {
  length?: number;
  default?: { val: string };
};
type Entity = cds.entity;

import { EntityDefinition, EntityElement } from "#cds-models/DataInspectorService";
import {
  HttpStatusCode,
  HIDDEN_ANNOTATION,
  DRAFT_ENTITIES_SUFFIX,
  CDS_ENTITIES,
  CDS_ELEMENTS,
} from "./constants";

const logger = cds.log("data-inspector");

export class EntityDefinitionReader {
  private _srvPrefixesCache: string[] = undefined;
  /**
   * Implements GET handler for DataInspectorService.EntityDefinition.
   * @param req Request object
   * @returns EntityDefinition[] | [{ $count: number }]
   */
  public read(req: cds.Request): EntityDefinition[] | [{ $count: number }] {
    const entityDefinitions = [];
    const entities = cds.model.all("entity") as Entity[];

    /**
     * Handle request for individual entity by ID
     */
    const parameters = req.params;
    if (parameters.length) {
      const filteredEntity = entities.filter((e) => e.name === parameters[0]["name"]);
      if (
        !filteredEntity.length ||
        filteredEntity[0][HIDDEN_ANNOTATION] ||
        filteredEntity[0]["name"].endsWith(DRAFT_ENTITIES_SUFFIX) ||
        CDS_ENTITIES.includes(filteredEntity[0]["name"])
      ) {
        return null;
      }

      const entity = filteredEntity[0];
      const entityDefinition: EntityDefinition = {};

      // Process $select
      for (const col of req.query.SELECT.columns) {
        // @ts-expect-error
        if (col === "*") {
          entityDefinition["name"] = entity.name;
          entityDefinition["title"] = entity["@title"] ?? null;
          // @ts-expect-error
          entityDefinition["dataSource"] = entity.dataSource4DataInspector;
          entityDefinition["elements"] = this._getEntityElements(entity);
        } else if (col?.ref[0] === "name") {
          entityDefinition["name"] = entity.name;
        } else if (col?.ref[0] === "title") {
          entityDefinition["title"] = entity["@title"] ?? null;
        } else if (col?.ref[0] === "dataSource") {
          // @ts-expect-error
          entityDefinition["dataSource"] = entity.dataSource4DataInspector;
        } else if (col?.ref[0] === "elements") {
          entityDefinition["elements"] = this._getEntityElements(entity);
        }
      }

      entityDefinitions.push(entityDefinition);

      return entityDefinitions;
    }

    /**
     * Handle request for entity collections
     */

    // Process $filter
    const filterFunction = this._determineFilter(req);
    const filteredEntities = entities.filter(filterFunction);

    const count = filteredEntities.length;

    // Process /$count request (plain count)
    if (req.query.SELECT.columns?.length === 1 && req.query.SELECT.columns[0].as === "$count") {
      return [{ $count: count }];
    }

    // Process $orderBy
    const orderByFunction = this._determineOrderBy(req);
    const orderedEntities = filteredEntities.sort(orderByFunction);

    // Process pagination - $skip, $top
    // @ts-expect-error
    const skip = req.req.query.$skip ? Number.parseInt(req.req.query.$skip) : 0;
    // @ts-expect-error
    const top = req.req.query.$top
      ? // @ts-expect-error
        Number.parseInt(req.req.query.$top)
      : orderedEntities.length;
    const pagedEntities = orderedEntities.slice(skip, skip + top);

    // Process $select
    const selectedColumns: string[] = this._determineSelectedColumns(req);
    for (const entity of pagedEntities) {
      const entityDefinition: EntityDefinition = {};

      if (selectedColumns.includes("*")) {
        entityDefinition["name"] = entity.name;
        entityDefinition["title"] = entity["@title"] ?? null;
        // @ts-expect-error
        entityDefinition["dataSource"] = entity.dataSource4DataInspector;
        entityDefinition["elements"] = this._getEntityElements(entity);
      } else {
        if (selectedColumns.includes("name")) {
          entityDefinition["name"] = entity.name;
        }
        if (selectedColumns.includes("title")) {
          entityDefinition["title"] = entity["@title"] ?? null;
        }
        if (selectedColumns.includes("dataSource")) {
          // @ts-expect-error
          entityDefinition["dataSource"] = entity.dataSource4DataInspector;
        }
        if (selectedColumns.includes("elements")) {
          entityDefinition["elements"] = this._getEntityElements(entity);
        }
      }

      entityDefinitions.push(entityDefinition);
    }

    // Process $count=true (inline count)
    if (req.query.SELECT.count === true) {
      entityDefinitions["$count"] = count;
    }

    return entityDefinitions;
  }

  /**
   * Returns a callback function for the filter function implementing $filter.
   * @param req Request object
   * @returns A callback function for the filter function
   */
  private _determineFilter(req: cds.Request) {
    // @ts-expect-error
    const filterString = req.req.query?.$filter;
    if (!filterString) {
      return (entity: Entity) =>
        entity[HIDDEN_ANNOTATION] !== true &&
        !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
        !CDS_ENTITIES.includes(entity["name"]);
    }

    let normalizedExpr = `${filterString}`;

    // Convert the operators from OData to CQL format
    normalizedExpr = normalizedExpr
      .replace(/\beq\b/g, "=")
      .replace(/\bne\b/g, "!=")
      .replace(/\bgt\b/g, ">")
      .replace(/\bge\b/g, ">=")
      .replace(/\blt\b/g, "<")
      .replace(/\ble\b/g, "<=");

    // Reference - https://cap.cloud.sap/docs/node.js/cds-compile#parse-cxl
    const cqn = cds.parse.expr(normalizedExpr);

    if (cqn["func"] === "contains" && cqn["xpr"] === undefined) {
      // operation is 'contains'
      const column = cqn["args"][0]["ref"][0];
      if (column === "elements") {
        req.reject(HttpStatusCode.BadRequest, "CANNOT_FILTER_BY_COLUMN");
      }
      const value = cqn["args"][1]["val"];

      const filterFunction = (entity: Entity) => {
        if (column === "name")
          return (
            entity[column].includes(value) &&
            entity[HIDDEN_ANNOTATION] !== true &&
            !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
            !CDS_ENTITIES.includes(entity["name"])
          );
        if (column === "title")
          return (
            !!entity["@title"] && // title may be undefined
            entity["@title"].includes(value) &&
            entity[HIDDEN_ANNOTATION] !== true &&
            !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
            !CDS_ENTITIES.includes(entity["name"])
          );
        if (column === "dataSource")
          return (
            // @ts-expect-error
            entity.dataSource4DataInspector.includes(value) &&
            entity[HIDDEN_ANNOTATION] !== true &&
            !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
            !CDS_ENTITIES.includes(entity["name"])
          );
      };
      return filterFunction;
    } else if (cqn["xpr"].length === 3 && cqn["xpr"][1] === "=") {
      // operation is 'eq'
      const column = cqn["xpr"][0]["ref"][0];
      if (column === "elements") {
        req.reject(HttpStatusCode.BadRequest, "CANNOT_FILTER_BY_COLUMN");
      }
      const value = cqn["xpr"][2]["val"];
      const filterFunction = (entity: Entity) => {
        if (column === "name")
          return (
            entity[column] === value &&
            entity[HIDDEN_ANNOTATION] !== true &&
            !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
            !CDS_ENTITIES.includes(entity["name"])
          );
        if (column === "title")
          return (
            !!entity["@title"] && // title may be undefined
            entity["@title"] === value &&
            entity[HIDDEN_ANNOTATION] !== true &&
            !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
            !CDS_ENTITIES.includes(entity["name"])
          );
        if (column === "dataSource")
          return (
            // @ts-expect-error
            entity.dataSource4DataInspector.includes(value) &&
            entity[HIDDEN_ANNOTATION] !== true &&
            !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
            !CDS_ENTITIES.includes(entity["name"])
          );
      };
      return filterFunction;
    } else if (
      // Support for a specific use case from the UI to filter by 'dataSource' AND 'name'.
      // For requests that come in the order: dataSource eq 'service' and contains(name, 'HelloWorld')
      // As a comprehensive OData parser is not implemented and to keep things simple, we are implementing the bare-minimum feature to work with the UI.
      cqn["xpr"].length === 5 &&
      cqn["xpr"][1] === "=" && // '=' & 'and' check should come before the rest, otherwise the rest may reference 'undefined' value
      cqn["xpr"][3] === "and" &&
      cqn["xpr"][0]["ref"][0] === "dataSource" &&
      cqn["xpr"][4]["func"] === "contains" &&
      cqn["xpr"][4]["args"][0]["ref"][0] === "name"
    ) {
      const dataSourceValue = cqn["xpr"][2]["val"];
      const nameValue = cqn["xpr"][4]["args"][1]["val"];
      const filterFunction = (entity: Entity) => {
        return (
          // @ts-expect-error
          entity.dataSource4DataInspector.includes(value) &&
          entity["name"].toLowerCase().includes(nameValue.toLowerCase()) &&
          entity[HIDDEN_ANNOTATION] !== true &&
          !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
          !CDS_ENTITIES.includes(entity["name"])
        );
      };
      return filterFunction;
    } else if (
      // Support for a specific use case from the UI to filter by 'dataSource' AND 'name'.
      // For requests that come in the order: contains(name, 'HelloWorld') and dataSource eq 'service'
      // As a comprehensive OData parser is not implemented and to keep things simple, we are implementing the bare-minimum feature to work with the UI.
      cqn["xpr"].length === 5 &&
      cqn["xpr"][1] === "and" && // '=' & 'and' check should come before the rest, otherwise the rest may reference 'undefined' value
      cqn["xpr"][3] === "=" &&
      cqn["xpr"][2]["ref"][0] === "dataSource" &&
      cqn["xpr"][0]["func"] === "contains" &&
      cqn["xpr"][0]["args"][0]["ref"][0] === "name"
    ) {
      const dataSourceValue = cqn["xpr"][4]["val"];
      const nameValue = cqn["xpr"][0]["args"][1]["val"];
      const filterFunction = (entity: Entity) => {
        return (
          // @ts-expect-error
          entity.dataSource4DataInspector.includes(value) &&
          entity["name"].toLowerCase().includes(nameValue.toLowerCase()) &&
          entity[HIDDEN_ANNOTATION] !== true &&
          !entity["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
          !CDS_ENTITIES.includes(entity["name"])
        );
      };
      return filterFunction;
    } else {
      logger.error(
        "Invalid $filter parameter: a singular 'contains' or 'eq' operation is accepted",
        filterString
      );
      req.reject(HttpStatusCode.BadRequest, "INVALID_FILTER_PARAM_SINGULAR");
    }
  }

  /**
   * Returns a list of column names that are supplied as $select
   * @param req Request object
   * @returns A list of column names
   */
  private _determineSelectedColumns(req: cds.Request): string[] {
    const selectColumns: string[] = [];
    for (const col of req.query.SELECT.columns) {
      // @ts-expect-error
      if (col === "*") {
        selectColumns.push("*");
      } else if (col?.ref[0] === "name") {
        selectColumns.push("name");
      } else if (col?.ref[0] === "title") {
        selectColumns.push("title");
      } else if (col?.ref[0] === "dataSource") {
        selectColumns.push("dataSource");
      } else if (col?.ref[0] === "elements") {
        selectColumns.push("elements");
      }
    }
    return selectColumns;
  }

  /**
   * Returns a callback function for the sort function implementing $orderby
   * @param req Request object
   * @returns A callback function for the sort function
   */
  private _determineOrderBy(req: cds.Request) {
    // @ts-expect-error
    const orderByString = req.req.query?.$orderby;
    if (!orderByString) {
      // sort by name ascending by default
      return (e1: Entity, e2: Entity) => e1["name"].localeCompare(e2["name"]);
    }
    const sortingColumn = req.query.SELECT.orderBy[0]["ref"][0];
    if (
      sortingColumn === "title" || // title may be undefined
      sortingColumn === "dataSource" || // doable, but don't see the necessity at the time of writing this
      sortingColumn === "elements" // arrayed type, cannot sort by arrays
    ) {
      req.reject(HttpStatusCode.BadRequest, "CANNOT_ORDER_BY_COLUMN");
    }

    const sortingOrder = req.query.SELECT.orderBy[0]["sort"];

    if (sortingOrder === "asc" || sortingOrder === undefined) {
      return (e1: Entity, e2: Entity) =>
        // @ts-expect-error
        e1[sortingColumn].localeCompare(e2[sortingColumn]);
    } else if (sortingOrder === "desc") {
      return (e1: Entity, e2: Entity) =>
        // @ts-expect-error
        e2[sortingColumn].localeCompare(e1[sortingColumn]);
    }
  }

  /**
   * Returns the dataSource of the entity
   * @param entity cds LinkedDefinition
   * @returns dataSource of entity ["db" | "service"]
   */
  // private _getDataSource(entity: Entity) {
  //   if (!this._srvPrefixesCache) {
  //     // Get all service name prefixes (with trailing dot) and keep it cached for data source determination
  //     this._srvPrefixesCache = cds.model
  //       .all("service")
  //       .map((srv) => srv.name + ".");
  //   }

  //   // If entity name starts with any service prefix, it's a service entity
  //   if (
  //     this._srvPrefixesCache.some((srvName) => entity.name.startsWith(srvName))
  //   ) {
  //     return EntityDefinition.dataSource.Service;
  //   }
  //   // For DB: exclude entities with @cds.persistence.skip === true
  //   if (entity["@cds.persistence.skip"] !== true) {
  //     return EntityDefinition.dataSource.Db;
  //   }
  //   // If entity is defined inside the db schema cds file and annotated with @cds.persistence.skip then return unknown
  //   return EntityDefinition.dataSource.Unknown;
  // }

  /**
   * Constructs and returns a list of EntityColumn representing each element of the given entity
   * @param entity cds LinkedDefinition
   * @returns A list of EntityColumn
   */
  private _getEntityElements(entity: Entity): EntityElement[] {
    const elements: EntityElement[] = Object.entries(entity.elements)
      .filter(
        ([name, element]: [string, Element]) =>
          !(
            element[HIDDEN_ANNOTATION] === true || // Exclude elements marked with the annotation
            element.type === "cds.Association" ||
            element.type === "cds.Composition" ||
            CDS_ELEMENTS.includes(name)
          )
      )
      .map(([name, element]: [string, Element]) => {
        return {
          name: name,
          type: element.type,
          length: element.length,
          defaultValue: element.default?.val ?? null,
          isKey: !!element.key,
          isNotNull: !!element.key || element.notNull === true,
          isSensitive: element["@PersonalData.IsPotentiallySensitive"] ?? false,
          isVirtual: element["@Core.Computed"] ?? false,
        };
      });
    return elements;
  }
}
