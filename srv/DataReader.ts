import cds from "@sap/cds";
import { Data } from "#cds-models/DataInspectorService";
import {
  HttpStatusCode,
  HIDDEN_ANNOTATION,
  DRAFT_ENTITIES_SUFFIX,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SELECT_MAX_PAGE_ANNOTATION,
  SELECT_DEFAULT_PAGE_ANNOTATION,
  CDS_ENTITIES,
  CDS_ELEMENTS,
} from "./constants";
import { AuditLogService, LogEntry } from "@cap-js/audit-logging";
const logger = cds.log("data-inspector");
type Entity = cds.entity;

export class DataReader {
  /**
   * Implements GET handler for DataInspectorService.Data.
   *
   * GET requests can be made in either of these two OData compliant ways only:
   * 1. To get a single record of an entity 'Foo' by its key 'Bar', use OData query by ID: /(entityName='Foo',recordKey='Bar=value')
   *    For composite key 'ABC' and 'XYZ', use '&' as separator: /(entityName='Foo',recordKey='ABC=value&XYZ=value')
   * 2. To get multiple records of an entity 'Foo', provide OData filter : $filter=entityName eq 'Foo'
   *
   * A singular GET request for all records of all entities is not supported.
   *
   * To $select, $filter and $orderby on certain columns of the entity records (dynamic metadata),
   * custom query options (r_select, r_filter and r_orderby respectively) are accepted that only work on the record columns.
   *
   * @param req Request object
   * @returns Promise<Data[] | [{ $count: number }]>
   */
  public async read(req: cds.Request): Promise<Data[] | [{ $count: number }]> {
    const data: Data[] = [];
    let entity: Entity = undefined;
    let r_filterFromRecordKey: string = undefined;

    // Processing for OData Query by ID requests
    if (req.params.length) {
      // Validate entityName
      const entityName = req.params[0]["entityName"];
      // @ts-expect-error
      entity = cds.model
        .all("entity")
        .find(
          (e) =>
            e.name === entityName &&
            e[HIDDEN_ANNOTATION] !== true &&
            !e["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
            !CDS_ENTITIES.includes(e.name)
        );
      if (entity === undefined) {
        return null;
      }

      // Validate recordKey
      const recordKey = req.params[0]["recordKey"]; // 'keyElementName=value', 'keyElement1Name=value&keyElement2Name=value', etc.
      if (!this._validateRecordKeys(entity, recordKey)) {
        req.reject({
          status: HttpStatusCode.BadRequest,
          code: `INVALID_RECORD_KEY`,
          args: [recordKey],
        });
      }

      // Transform the supplied recordKey to r_filter condition for building CQN
      const r_filterSegments: string[] = [];
      const keys = recordKey.split("&"); // keys could be composite
      for (const key of keys) {
        const keyValuePair = key.split("=");
        r_filterSegments.push(`${keyValuePair[0]} eq '${keyValuePair[1]}'`);
      }
      r_filterFromRecordKey = r_filterSegments.join(" and ");
    }

    // For OData Collection requests, determine the Entity from the $filter parameter
    // The supplied entityName in the $filter parameter becomes the Entity for the SELECT FROM <Entity> statement
    if (entity === undefined) {
      entity = this._determineEntityFromFilterParam(req);
      if (entity === undefined) {
        return null;
      }
    }

    const selectedColumns: string[] = this._determineSelectedColumns(req);

    let isSelectOnlyKeys = true;
    if (selectedColumns.includes("record") || selectedColumns.includes("*")) {
      isSelectOnlyKeys = false;
    }

    // Identify data source
    // If the entity is defined in a service, use that service as the data source; otherwise use the db service
    const service = cds.model
      .all("service")
      .find((service) => entity.name.startsWith(service.name + "."));
    const dataSource = service !== undefined ? cds.services[service.name] : cds.services.db;

    /**
     * Select data from the determined data source
     */
    const cqn = this._constructCqn(req, entity, isSelectOnlyKeys, r_filterFromRecordKey);

    let records;
    try {
      records = await dataSource.run(cqn);
    } catch (e) {
      logger.error("Failed to select records:", cqn, e);
      req.reject({
        status: HttpStatusCode.InternalServerError,
        code: `ERROR_RUNNING_DB_QUERY`,
      });
    }

    /**
     * Process nextLink
     * nextLink should occur when the result set is truncated due to default or max page size limit
     * 5 cases possible:
     * Case 1: Default < $top < max => no nextLink
     * Case 2: $top < default < max => no nextLink
     * Case 3: Default < max < $top => Provide nextLink
     * Case 4: No $top = default => Provide nextLink if $count > default
     * Case 5: $top = 0 => no nextLink
     */
    const maxPageSize = entity[SELECT_MAX_PAGE_ANNOTATION] ?? MAX_PAGE_SIZE; // Respect @cds.query.limit.max if defined on the entity or the service
    const defaultPageSize = entity[SELECT_DEFAULT_PAGE_ANNOTATION] ?? DEFAULT_PAGE_SIZE; // Respect @cds.query.limit.default if defined on the entity or the service
    // @ts-expect-error
    const top = req.req.query.$top;
    if (
      (top && Number(top) > maxPageSize) || // case 3 above
      (!top && records.$count > defaultPageSize) // case 4 above
    ) {
      // Check if next page exists
      let limit: number = defaultPageSize;
      if (top) {
        limit = Number(top) > maxPageSize ? maxPageSize : Number(top);
      }
      const nextTokenOffset = Number(cqn.SELECT.limit.offset.val) + Number(limit);
      const nextPageProbeCqn = this._constructNextPageProbeCqn(req, entity, nextTokenOffset);

      let result;
      try {
        result = await dataSource.run(nextPageProbeCqn);
      } catch (e) {
        logger.error("Failed to probe next page:", nextPageProbeCqn, e);

        req.reject(
          HttpStatusCode.InternalServerError,
          cds["i18n"].messages.at("ERROR_RUNNING_DB_QUERY")
        );
      }

      // Provide nextLink if next page exists
      if (result.length > 0) {
        data["$nextLink"] = nextTokenOffset;
      }
    }

    // If the request is Query by ID and no record is found...
    if (req.params.length && records.length === 0) {
      // ...it should respond with HTTP 404 Not Found, not an empty list
      return null;
    }

    // Process /$count request (plain count)
    if (req.query.SELECT.columns?.length === 1 && req.query.SELECT.columns[0].as === "$count") {
      return [{ $count: records[0].$count }];
    }

    // Construct response
    for (const record of records) {
      const row: Data = {};

      // Process $select
      if (selectedColumns.includes("record") || selectedColumns.includes("*")) {
        row["entityName"] = entity.name;
        row["recordKey"] = this._constructRecordKey(entity, record);
        row["record"] = record;
      } else {
        row["entityName"] = entity.name;
        row["recordKey"] = this._constructRecordKey(entity, record);
      }

      data.push(row);
    }

    // Process $count=true (inline count)
    if (req.query.SELECT.count === true) {
      data["$count"] = records.$count;
    }

    // Emit audit logs
    await this._emitAuditlogs(entity, records);

    return data;
  }

  /**
   * Utility method to validate the supplied recordKey in OData query by ID requests.
   * @param entity cds LinkedDefinition
   * @param recordKey string - e.g. 'keyElementName=value', 'keyElement1Name=value&keyElement2Name=value', etc.
   * @returns boolean
   */
  private _validateRecordKeys(entity: Entity, recordKey: string): boolean {
    // @ts-expect-error
    const recordKeyElements = entity.keyElements4DataInspector;
    const entityKeys: Set<string> = new Set<string>(recordKeyElements);

    // Each of the key elements must be present in an OData Query by ID request
    const keys = recordKey.split("&");
    for (const key of keys) {
      const columnName = key.split("=")[0];
      if (entityKeys.has(columnName)) {
        entityKeys.delete(columnName);
      } else {
        return false;
      }
    }
    // Make sure all composite key elements are supplied
    if (entityKeys.size !== 0) {
      return false;
    }
    return true;
  }

  /**
   * Determines the Entity specified in the OData request $filter parameter.
   * Accepts a singular 'eq' opertaion on entityName: '$filter=entityName eq value', otherwise rejects the request with HTTP 400.
   * @param req Request object
   * @returns Entity name
   */
  private _determineEntityFromFilterParam(req: cds.Request): Entity | undefined {
    // @ts-expect-error
    const filterString = req.req.query?.$filter;

    if (!filterString) {
      req.reject(HttpStatusCode.BadRequest, "FILTER_PARAM_NOT_FOUND");
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

    if (
      cqn["xpr"].length !== 3 ||
      cqn["xpr"][1] !== "=" ||
      cqn["xpr"][0]["ref"][0] !== "entityName"
    ) {
      req.reject(HttpStatusCode.BadRequest, "FILTER_PARAM_INVALID");
    }

    const entityName: string = cqn["xpr"][2]["val"];
    // @ts-expect-error
    const entity: Entity = cds.model
      .all("entity")
      .find(
        (e) =>
          e.name === entityName &&
          e[HIDDEN_ANNOTATION] !== true &&
          !e["name"].endsWith(DRAFT_ENTITIES_SUFFIX) &&
          !CDS_ENTITIES.includes(e.name)
      );

    return entity;
  }

  /**
   * Returns a list of column names that are supplied as $select in the request.
   * @param req Request object
   * @returns A list of column names
   */
  private _determineSelectedColumns(req: cds.Request): string[] {
    const selectColumns: string[] = [];

    // Process /$count request (plain count)
    if (req.query.SELECT.columns?.length === 1 && req.query.SELECT.columns[0].as === "$count") {
      return [];
    }
    for (const col of req.query.SELECT.columns) {
      // @ts-expect-error
      if (col === "*") {
        selectColumns.push("*");
      } else if (col?.ref[0] === "entityName") {
        selectColumns.push("entityName");
      } else if (col?.ref[0] === "recordKey") {
        selectColumns.push("recordKey");
      } else if (col?.ref[0] === "record") {
        selectColumns.push("record");
      }
    }
    return selectColumns;
  }

  /**
   * Determines and returns all the elements of an Entity, excluding ones with HIDDEN_ANNOTATION.
   * @param entity cds LinkedDefinition
   * @returns list of all element names
   */
  private _getRecordElements(entity: Entity): string[] {
    const recordElements: string[] = [];
    Object.entries(entity.elements).forEach(
      // @ts-expect-error
      ([name, element]: [string, Element]) => {
        if (
          !(
            element[HIDDEN_ANNOTATION] === true || // Exclude elements marked with the annotation
            // @ts-expect-error
            element.type === "cds.Association" ||
            // @ts-expect-error
            element.type === "cds.Composition" ||
            CDS_ELEMENTS.includes(name)
          )
        ) {
          // If the entity is defined in an @odata.draft.enabled service, IsActiveEntity is a virtual key
          // TODO: Remove the exclusion IsActiveEntity check when adding support to show draft entries
          recordElements.push(name);
        }
      }
    );
    return recordElements;
  }

  /**
   * Determines and returns recordKey for a given Entity and its record.
   * For single key 'Foo' and value 'Bar, it returns 'Foo=Bar'
   * For composite key 'Foo1' and 'Foo2' with respective values 'Bar1' and 'Bar2', it returns 'Foo1=Bar1&Foo2=Bar2'
   * @param entity cds LinkedDefinition
   * @param record a record of cds LinkedDefinition
   * @returns recordKey
   */
  private _constructRecordKey(entity: Entity, record): string {
    const keys: string[] = [];
    // @ts-expect-error
    const keyElements = entity.keyElements4DataInspector;
    for (const key of keyElements) {
      keys.push(`${key}=${record[key]}`);
    }
    const recordKey: string = keys.join("&");
    return recordKey;
  }

  /**
   * Constructs and returns a CQN for directly querying the CAP service.
   * @param req Request object
   * @param entity cds LinkedDefinition
   * @param isSelectOnlyKeys if only key elements are to be selected
   * @param r_filterFromRecordKey Optional: if the request is Query by ID
   * @returns cds CQN
   */
  private _constructCqn(
    req: cds.Request,
    entity: Entity,
    isSelectOnlyKeys: boolean,
    r_filterFromRecordKey?: string
  ) {
    let cqn = cds.ql.SELECT.from(entity);
    const entityElements = this._getRecordElements(entity);

    /**
     * Handle plain /$count
     */
    if (req.query.SELECT.columns?.length === 1 && req.query.SELECT.columns[0].as === "$count") {
      cqn = cqn.columns({ func: "count", as: "$count", args: [{ val: 1 }] });
    } else {
      /**
       * Handle r_select
       */
      // @ts-expect-error
      let r_select: string = req.req.query?.r_select;
      if (isSelectOnlyKeys) {
        // Select only the key elements
        // @ts-expect-error
        const recordKeyElements = entity.keyElements4DataInspector;
        r_select = recordKeyElements.join(",");
      } else if (r_select === undefined) {
        // Identify columns to be selected to exclude hidden ones with HIDDEN_ANNOTATION
        r_select = entityElements.join(",");
      } else {
        // Validate the supplied element names for r_select
        const selectedRecordElements = r_select.split(",");
        for (const elementName of selectedRecordElements) {
          if (!entityElements.includes(elementName)) {
            req.reject({
              status: HttpStatusCode.BadRequest,
              code: `INVALID_ELEMENT_IN_R_SELECT`,
              args: [r_select],
            });
          }
        }

        // For data source service, key elements are automatically returned by CDS even if not explicitly specified in the select statement
        // For data source db, that is not the case, so explicitly add key elements to select statement if they don't come as part of the request
        // @ts-expect-error
        const recordKeyElements = entity.keyElements4DataInspector;
        let missingKeys: string = "";
        for (const key of recordKeyElements) {
          if (!selectedRecordElements.includes(key)) {
            missingKeys = missingKeys + "," + key;
          }
        }
        if (missingKeys !== "") {
          r_select = r_select + missingKeys;
        }
      }

      const elements = r_select.split(",").map((el) => el.trim());
      cqn = cqn.columns(
        elements.map((el) => {
          return { ref: [el] };
        })
      );
    }

    /**
     * Handle r_filter
     */
    let r_filter: string;
    if (r_filterFromRecordKey) {
      r_filter = r_filterFromRecordKey;
      // @ts-expect-error
    } else if (req.req.query?.r_filter) {
      // @ts-expect-error
      r_filter = req.req.query?.r_filter;
    }
    if (r_filter) {
      try {
        let normalizedExpr = `${r_filter}`;

        // Convert the operators from OData to CQL format
        normalizedExpr = normalizedExpr
          .replace(/\beq\b/g, "=")
          .replace(/\bne\b/g, "!=")
          .replace(/\bgt\b/g, ">")
          .replace(/\bge\b/g, ">=")
          .replace(/\blt\b/g, "<")
          .replace(/\ble\b/g, "<=");

        // Reference - https://cap.cloud.sap/docs/node.js/cds-compile#parse-cxl
        const expr = cds.parse.expr(normalizedExpr);

        // NOTE: Validating the supplied element names for r_filter is not trivial
        // Therefore at this point this is left to be handled by the database query itself
        // This will have a limitation of returning HTTP 500 error instead of HTTP 400 when invalid element names are supplied in r_filter
        cqn = cqn.where(expr);
      } catch (error) {
        logger.error("Failed to parse the r_filter query parameter", r_filter, error);
        req.reject(
          HttpStatusCode.BadRequest,
          cds["i18n"].messages.at("INVALID_R_FILTER_QUERY_PARAM") + ":" + error.message
        );
      }
    }

    /**
     * Handle r_orderby
     */
    // @ts-expect-error
    const r_orderby: string = req.req.query?.r_orderby;
    if (r_orderby) {
      const orderbyElements = [];

      const order = r_orderby.split(",").map((o) => {
        const [element, dir] = o.trim().split(" ");
        orderbyElements.push(element);
        return { ref: [element], sort: dir || "asc" };
      });

      // validate the supplied element names for r_orderby
      for (const element of orderbyElements) {
        if (!entityElements.includes(element)) {
          req.reject({
            status: HttpStatusCode.BadRequest,
            code: `INVALID_ELEMENT_IN_R_ORDERBY`,
            args: [r_orderby],
          });
        }
      }
      // @ts-expect-error
      cqn = cqn.orderBy(order);
    }

    /**
     * Handle $skip and $top - https://cap.cloud.sap/docs/guides/providing-services#pagination-sorting
     * Reliable pagination not supported - https://cap.cloud.sap/docs/guides/providing-services#reliable-pagination
     */
    let limit: number = entity[SELECT_DEFAULT_PAGE_ANNOTATION] ?? DEFAULT_PAGE_SIZE; // Respect @cds.query.limit.default if defined on the entity or the service
    // @ts-expect-error
    const top = req.req.query.$top; // top = 'limit' or 'rows' in CQN
    if (top) {
      if (Number(top) < 0) {
        req.reject(HttpStatusCode.BadRequest, `INVALID_TOP`);
      }
      const maxPageSize = entity[SELECT_MAX_PAGE_ANNOTATION] ?? MAX_PAGE_SIZE; // Respect @cds.query.limit.max if defined on the entity or the service
      limit = Number(top) > maxPageSize ? maxPageSize : Number(top);
    }

    let offset: number = 0;
    // @ts-expect-error
    const skip = req.req.query.$skip; // skip = 'offset' in CQN
    if (skip) {
      if (Number(skip) < 0) {
        req.reject(HttpStatusCode.BadRequest, `INVALID_SKIP`);
      }
      offset = Number(skip);
    }
    // @ts-expect-error
    const skipToken = req.req.query.$skiptoken;
    if (skipToken) {
      if (Number(skipToken) < 0) {
        req.reject(HttpStatusCode.BadRequest, `INVALID_SKIPTOKEN`);
      }
      offset = offset + Number(skipToken);
    }

    cqn = cqn.limit(limit, offset);

    /**
     * Always request count regardless of $count=true or not in the request
     * as this is needed for processing nextLink (server side pagination)
     */
    cqn["SELECT"]["count"] = true;

    return cqn;
  }

  /**
   * Constructs and returns a CQN for directly querying the CAP service.
   * @param req Request object
   * @param entity cds LinkedDefinition
   * @param nextTokenOffset Next page offset value
   * @returns cds CQN
   */
  private _constructNextPageProbeCqn(req: cds.Request, entity: Entity, nextTokenOffset: number) {
    let cqn = cds.ql.SELECT.from(entity);

    /**
     * Provide columns for SELECT; selecting only the key elements
     */
    // @ts-expect-error
    const recordKeyElements = entity.keyElements4DataInspector;
    const elements = recordKeyElements.map((el) => el.trim());
    cqn = cqn.columns(
      elements.map((el) => {
        return { ref: [el] };
      })
    );

    /**
     * Provide WHERE condition
     */
    // @ts-expect-error
    const r_filter: string = req.req.query?.r_filter;
    if (r_filter) {
      let normalizedExpr = `${r_filter}`;

      // Convert the operators from OData to CQL format
      normalizedExpr = normalizedExpr
        .replace(/\beq\b/g, "=")
        .replace(/\bne\b/g, "!=")
        .replace(/\bgt\b/g, ">")
        .replace(/\bge\b/g, ">=")
        .replace(/\blt\b/g, "<")
        .replace(/\ble\b/g, "<=");

      // Reference - https://cap.cloud.sap/docs/node.js/cds-compile#parse-cxl
      // No need for handling error here as it was already handled in _constructCqn()
      const expr = cds.parse.expr(normalizedExpr);
      cqn = cqn.where(expr);
    }

    /**
     * Provide ORDERBY
     */
    // @ts-expect-error
    const r_orderby: string = req.req.query?.r_orderby;
    if (r_orderby) {
      const orderbyElements = [];
      const order = r_orderby.split(",").map((o) => {
        const [element, dir] = o.trim().split(" ");
        orderbyElements.push(element);
        return { ref: [element], sort: dir || "asc" };
      });
      // @ts-expect-error
      cqn = cqn.orderBy(order);
    }

    /**
     * Handle $skip and $top - https://cap.cloud.sap/docs/guides/providing-services#pagination-sorting
     * Reliable pagination not supported - https://cap.cloud.sap/docs/guides/providing-services#reliable-pagination
     */
    let limit: number = entity[SELECT_DEFAULT_PAGE_ANNOTATION] ?? DEFAULT_PAGE_SIZE; // Respect @cds.query.limit.default if defined on the entity or the service
    // @ts-expect-error
    const top = req.req.query.$top; // top = 'limit' or 'rows' in CQN
    if (top) {
      const maxPageSize = entity[SELECT_MAX_PAGE_ANNOTATION] ?? MAX_PAGE_SIZE; // Respect @cds.query.limit.max if defined on the entity or the service
      limit = Number(top) > maxPageSize ? maxPageSize : Number(top);
    }
    cqn = cqn.limit(limit, nextTokenOffset);

    return cqn;
  }

  /**
   * Returns a list of all the sensitive elements present in the entity.
   * @param entity cds LinkedDefinition
   * @returns list of all sensitive element names
   */
  private _getRecordSensitiveElements(entity: Entity): string[] {
    const sensitiveElements: string[] = [];
    Object.entries(entity.elements).forEach(
      // @ts-expect-error
      ([name, element]: [string, Element]) => {
        if (element["@PersonalData.IsPotentiallySensitive"]) {
          sensitiveElements.push(name);
        }
      }
    );
    return sensitiveElements;
  }

  /**
   * Emits audit logs for read access of sensitive fields of the entity.
   * @param entity cds LinkedDefinition
   * @param records final query response to be sent back to client
   * @returns
   */
  private async _emitAuditlogs(entity: Entity, records) {
    if (
      records.length === 0 ||
      !cds.env.requires["audit-log"] ||
      // @ts-expect-error
      entity._service !== undefined // emit audit logs for data source db, CDS automatically emits audit logs for data source service
    ) {
      return;
    }

    const sensitiveElements: string[] = this._getRecordSensitiveElements(entity);
    if (sensitiveElements.length === 0) {
      return;
    }

    // @ts-expect-error
    const keyElements = entity.keyElements4DataInspector;

    const auditLogService: AuditLogService = await cds.connect.to("audit-log");
    for (const record of records) {
      const attributes: { name: string }[] = [];
      // checking if sensitive element is exposed for each record is the safest way
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [elementName, _] of Object.entries(record)) {
        if (sensitiveElements.includes(elementName)) {
          attributes.push({ name: elementName });
        }
      }
      if (attributes.length === 0) {
        continue;
      }
      const id = {};
      // handle composite key
      for (const keyElement of keyElements) {
        id[keyElement] = record[keyElement];
      }
      // eslint-disable-next-line no-await-in-loop
      await auditLogService.log("SensitiveDataRead", {
        data_subject: {
          id: id,
          role: entity["@PersonalData.DataSubjectRole"],
          type: entity.name,
        },
        object: { type: entity.name, id: id },
        attributes: attributes,
      } as LogEntry);
    }
  }
}
