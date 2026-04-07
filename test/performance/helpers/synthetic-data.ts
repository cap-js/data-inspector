/**
 * Synthetic data generators and mock request builders.
 *
 * These functions produce deterministic, configurable test data that isolates
 * plugin processing from real CDS models and database queries. Used by
 * performance benchmarks to control input size precisely.
 */

// ---------------------------------------------------------------------------
// Entity generators
// ---------------------------------------------------------------------------

/**
 * Builds an array of synthetic CDS-like entity definitions.
 *
 * Each entity includes:
 * - A UUID key element
 * - `elementsPerEntity - 1` typed fields with varied annotations
 * - One hidden element (`@HideFromDataInspector: true`) — should be filtered out
 * - One association element — should be filtered out
 *
 * @param count - Number of entities to generate
 * @param elementsPerEntity - Number of regular elements per entity (default 10)
 */
export function buildSyntheticEntities(count: number, elementsPerEntity: number = 10): any[] {
  const entities: any[] = [];
  for (let i = 0; i < count; i++) {
    const elements: Record<string, any> = {};

    // Key element
    elements[`id_${i}`] = {
      type: "cds.UUID",
      key: true,
      "@HideFromDataInspector": false,
    };

    // Regular elements with varied types and annotations
    for (let j = 1; j < elementsPerEntity; j++) {
      elements[`field_${i}_${j}`] = {
        type: j % 3 === 0 ? "cds.Integer" : j % 3 === 1 ? "cds.String" : "cds.Boolean",
        key: false,
        length: j % 3 === 1 ? 255 : undefined,
        default: j % 5 === 0 ? { val: "default" } : undefined,
        notNull: j % 4 === 0,
        "@PersonalData.IsPotentiallySensitive": j % 7 === 0,
        "@Core.Computed": j % 9 === 0,
        "@HideFromDataInspector": false,
      };
    }

    // Hidden element (filtered out by EntityDefinitionReader)
    elements[`hidden_${i}`] = {
      type: "cds.String",
      "@HideFromDataInspector": true,
    };

    // Association element (filtered out by EntityDefinitionReader)
    elements[`assoc_${i}`] = {
      type: "cds.Association",
    };

    entities.push({
      name: `perf.test.Entity_${i}`,
      "@title": i % 3 === 0 ? `Entity ${i} Title` : undefined,
      "@HideFromDataInspector": false,
      elements,
      get dataSource4DataInspector() {
        return i % 2 === 0 ? "db" : "service";
      },
      get keyElements4DataInspector() {
        return [`id_${i}`];
      },
    });
  }
  return entities;
}

// ---------------------------------------------------------------------------
// Record generators
// ---------------------------------------------------------------------------

/**
 * Builds an array of synthetic database records for DataReader benchmarks.
 *
 * Each record contains an `id` field and `fieldsPerRecord - 1` typed fields.
 * The returned array has a `$count` property set to `count` (simulating CDS query result).
 *
 * @param count - Number of records to generate
 * @param fieldsPerRecord - Number of fields per record (default 10)
 */
export function buildSyntheticRecords(count: number, fieldsPerRecord: number = 10): any[] {
  const records: any[] = [];
  for (let i = 0; i < count; i++) {
    const record: Record<string, any> = { id: `uuid-${i}` };
    for (let j = 1; j < fieldsPerRecord; j++) {
      record[`field_${j}`] = j % 3 === 0 ? i * j : j % 3 === 1 ? `value_${i}_${j}` : i % 2 === 0;
    }
    records.push(record);
  }
  (records as any).$count = count;
  return records;
}

// ---------------------------------------------------------------------------
// Mock request builders
// ---------------------------------------------------------------------------

/**
 * Creates a mock `cds.Request` for EntityDefinitionReader.read() — collection request.
 *
 * Simulates a GET with `$select=*` and optional OData query options.
 *
 * @param options.filter - OData $filter expression (e.g. `contains(name, 'Foo')`)
 * @param options.orderby - OData $orderby expression (e.g. `name asc`)
 * @param options.skip - OData $skip value
 * @param options.top - OData $top value
 */
export function buildEntityDefinitionRequest(options?: {
  filter?: string;
  orderby?: string;
  skip?: number;
  top?: number;
}): any {
  const columns = ["*"];
  return {
    params: [],
    query: {
      SELECT: {
        columns,
        count: true,
        orderBy: options?.orderby
          ? [{ ref: [options.orderby.split(" ")[0]], sort: options.orderby.split(" ")[1] || "asc" }]
          : undefined,
      },
    },
    req: {
      query: {
        $filter: options?.filter,
        $orderby: options?.orderby,
        $skip: options?.skip !== undefined ? String(options.skip) : undefined,
        $top: options?.top !== undefined ? String(options.top) : undefined,
      },
    },
    reject: (code: number, msg: string) => {
      throw new Error(`Request rejected: ${code} ${msg}`);
    },
  };
}

/**
 * Creates a mock `cds.Request` for DataReader.read() — data retrieval request.
 *
 * Simulates a GET filtered by entity name with `$select=*`.
 *
 * @param entityName - The entity name to filter on (e.g. `perf.test.Entity_0`)
 */
export function buildDataReadRequest(entityName: string): any {
  const columns = ["*"];
  return {
    params: [],
    query: {
      SELECT: {
        columns,
        count: true,
      },
    },
    req: {
      query: {
        $filter: `entityName = '${entityName}'`,
        $skip: "0",
        $top: "1000",
      },
    },
    reject: (code: number, msg: string) => {
      throw new Error(`Request rejected: ${code} ${msg}`);
    },
  };
}
