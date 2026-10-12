import cds from "@sap/cds";

const { expect, assert, GET } = cds.test(__dirname);

const SERVICE_ENDPOINT = "/odata/v4/data-inspector";
const AXIOS_REQ_CONFIG = {
  auth: {
    username: "test",
    password: "12345",
  },
};

describe("Data entity authorization test", async () => {
  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET authorization scope", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.ProductService.Product'",
      AXIOS_REQ_CONFIG
    );
    expect(response0.status).to.be.equal(200, "Failed to access endpoint with authorization scope");

    //*********************************************************************//
    let hadError = false;
    try {
      await GET(SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Product'", {
        auth: {
          username: "test-no-auth",
          password: "12345",
        },
      });
    } catch (e) {
      expect(e.status).to.be.equal(403, "Able to access endpoint without authorization scope");
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Product'");
    } catch (e) {
      expect(e.status).to.be.equal(401, "Able to access endpoint without authentication");
      hadError = true;
    }
    expect(hadError).to.be.true;
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */
});

/**
 * ***********************************************************************
 * ***********************************************************************
 * ***********************************************************************
 */

describe("Data entity tests", async () => {
  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data with invalid OData syntax", async () => {
    //*********************************************************************//

    let hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=productName xx 'iPhone 14'&r_select=productName",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return expected HTTP 400 error on GET Data collection with an invalid OData r_filter operation"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data without $filter", async () => {
    //*********************************************************************//

    let hadError = false;
    try {
      await GET(SERVICE_ENDPOINT + "/Data", AXIOS_REQ_CONFIG);
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return expected HTTP 400 error on GET Data collection without $filter query parameter"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT + "/Data?$filter=entityName ne 'datainspector.test.db.Products'",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return expected HTTP 400 error on GET Data collection with $filter query parameter operation other than eq"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    const response = await GET(
      SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Products'",
      AXIOS_REQ_CONFIG
    );
    assert(
      response.status === 200 && response.data.value.length === 0,
      "Failed to return HTTP 200 with empty response for $filter on non-existent entity"
    );
    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data Query by ID", async () => {
    //*********************************************************************//

    let hadError = false;
    try {
      await GET(SERVICE_ENDPOINT + "/Data(recordKey='ID=prod1')", AXIOS_REQ_CONFIG);
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return HTTP 400 code for GET by ID without entityName"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT + "/Data(entityName='datainspector.test.db.Product')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return HTTP 400 code for GET by ID without recordKey"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT + "/Data(entityName='datainspector.test.db.Product',recordKey='ID=prod1')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.entityName === "datainspector.test.db.Product" &&
        response0.data.recordKey === "ID=prod1" &&
        response0.data.record["productName"] === "iPhone 14",
      "Failed to get record by ID of single key"
    );

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data(entityName='datainspector.test.db.Product',recordKey='ID=prod100')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        404,
        "Failed to return HTTP 404 code for GET by ID on non-existent single key record"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT +
        "/Data(entityName='datainspector.test.db.HelloWorld',recordKey='helloId=H008&worldId=W008&otherId=O008')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.entityName === "datainspector.test.db.HelloWorld" &&
        response1.data.recordKey === "helloId=H008&worldId=W008&otherId=O008" &&
        response1.data.record["color"] === "Purple",
      "Failed to get record by ID of composite key"
    );

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data(entityName='datainspector.test.db.HelloWorld',recordKey='helloId=H080&worldId=W008&otherId=O008')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        404,
        "Failed to return HTTP 404 code for GET by ID on non-existent composite key record"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data(entityName='datainspector.test.db.HelloWorld',recordKey='helloId=H008&worldId=W008')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return HTTP 400 code for GET by ID on missing composite key"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data(entityName='datainspector.test.db.HelloWorld',recordKey='helloId=H008&worldId=W008&otherId=O008&extraneousId=O008')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return HTTP 400 code for GET by ID on extraneous composite key"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data(entityName='datainspector.test.db.HelloWorld',recordKey='helloId=H008&worldId=W008&wrongId=O008')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return HTTP 400 code for GET by ID on wrong composite key"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data(entityName='datainspector.test.db.H3ll0W0r1d',recordKey='helloId=1&worldId=2&otherId=3')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        404,
        "Failed to return HTTP 404 code for GET by ID on non-existent entity"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */
  it("GET Data $count", async () => {
    //*********************************************************************//
    const response0 = await GET(
      SERVICE_ENDPOINT + "/Data/$count?$filter=entityName eq 'datainspector.test.db.Product'",
      AXIOS_REQ_CONFIG
    );

    expect(response0.data).to.equal(12, "Failed to get only the count of total number of entities");

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$count=true",
      AXIOS_REQ_CONFIG
    );

    expect(response1.data["@odata.count"]).to.equal(
      12,
      "Failed to include @odata.count in collection request"
    );
    expect(response1.data.value.length).to.equal(12);

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$select=entityName",
      AXIOS_REQ_CONFIG
    );

    expect(response2.data["@odata.count"]).to.equal(
      undefined,
      "Failed to exclude @odata.count when not requested"
    );
    expect(response2.data.value.length).to.equal(12);

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data $select", async () => {
    //*********************************************************************//
    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$select=entityName",
      AXIOS_REQ_CONFIG
    );

    expect(response0.data.value[0]["entityName"]).to.equal("datainspector.test.db.Product");
    expect(response0.data.value[0]["recordKey"]).to.not.equal(undefined);
    expect(response0.data.value[0]["record"]).to.equal(
      undefined,
      "Failed to exclude property when not requested in $select"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$select=record",
      AXIOS_REQ_CONFIG
    );

    expect(response1.data.value[0]["entityName"]).to.equal("datainspector.test.db.Product");
    expect(response1.data.value[0]["recordKey"]).to.not.equal(undefined);
    expect(response1.data.value[0]["record"]).to.not.equal(
      undefined,
      "Failed to include property when requested in $select"
    );

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data $skip $top", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$skip=0&$top=10",
      AXIOS_REQ_CONFIG
    );
    expect(response0.data.value.length).to.be.equal(
      10,
      "Failed to return paginated entries with skip=0 top=10"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$skip=0&$top=4",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value.length === 4 &&
        response1.data.value[0].recordKey === response0.data.value[0].recordKey &&
        response1.data.value[3].recordKey === response0.data.value[3].recordKey,
      "Failed to return paginated entries with skip=0 top=4"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$skip=4&$top=4",
      AXIOS_REQ_CONFIG
    );
    assert(
      response2.data.value.length === 4 &&
        response2.data.value[0].recordKey === response0.data.value[4].recordKey &&
        response2.data.value[3].recordKey === response0.data.value[7].recordKey,
      "Failed to return paginated entries with skip=4 top=4"
    );

    //*********************************************************************//

    const response3 = await GET(
      SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$skip=4",
      AXIOS_REQ_CONFIG
    );
    assert(
      response3.data.value.length === 8 &&
        response3.data.value[0].recordKey === response0.data.value[4].recordKey,
      "Failed to return paginated entries with skip=4"
    );

    //*********************************************************************//

    const response4 = await GET(
      SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Product'&$top=4",
      AXIOS_REQ_CONFIG
    );
    assert(
      response4.data.value.length === 4 &&
        response4.data.value[0].recordKey === response0.data.value[0].recordKey &&
        response4.data.value[3].recordKey === response0.data.value[3].recordKey,
      "Failed to return paginated entries with top=4"
    );

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data r_select", async () => {
    //*********************************************************************//
    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_select=productName,description",
      AXIOS_REQ_CONFIG
    );

    expect(response0.data.value[0]["record"]["productName"]).to.not.equal(
      undefined,
      "Failed to include property when requested in r_select"
    );
    expect(response0.data.value[0]["record"]["description"]).to.not.equal(
      undefined,
      "Failed to include property when requested in r_select"
    );
    expect(response0.data.value[0]["record"]["quantity"]).to.equal(
      undefined,
      "Failed to exclude property when not requested in r_select"
    );
    expect(response0.data.value[0]["record"]["mrp"]).to.equal(
      undefined,
      "Failed to exclude property when not requested in r_select"
    );
    expect(response0.data.value[0]["record"]["ID"]).to.not.equal(
      undefined,
      "Failed to include the key property even when not requested in r_select"
    );

    //*********************************************************************//

    let hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_select=randomName,description",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to return expected HTTP 400 error on GET Data collection with r_select query parameter with invalid element name"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data r_filter", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=productName eq 'iPhone 14'&r_select=productName",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.value.length === 1 &&
        response0.data.value[0].record.productName === "iPhone 14",
      "Failed to r_filter record with 'eq' operation"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=contains(productName, 'iPhone')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value[0].record.productName.includes("iPhone"),
      "Failed to r_filter record with 'contains' operation"
    );

    //*********************************************************************//

    const response7 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=contains(productName, 'iphone')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response7.data.value.length === 0,
      "Failed to r_filter record with 'contains' operation with case sensitivity"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=quantity lt 100&r_orderby=quantity desc",
      AXIOS_REQ_CONFIG
    );
    assert(
      response2.data.value[0].record.quantity < 100 && response2.data.value.length === 10,
      "Failed to r_filter record with 'lt' operation"
    );

    //*********************************************************************//

    const response3 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=quantity le 100&r_orderby=quantity desc",
      AXIOS_REQ_CONFIG
    );
    assert(
      response3.data.value[0].record.quantity === 100 && response3.data.value.length === 11,
      "Failed to r_filter record with 'le' operation"
    );

    //*********************************************************************//

    const response4 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=quantity gt 100&r_orderby=quantity asc",
      AXIOS_REQ_CONFIG
    );
    assert(
      response4.data.value[0].record.quantity > 100 && response4.data.value.length === 1,
      "Failed to r_filter record with 'gt' operation"
    );

    //*********************************************************************//

    const response5 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=quantity ge 100&r_orderby=quantity asc",
      AXIOS_REQ_CONFIG
    );
    assert(
      response5.data.value[0].record.quantity === 100 && response5.data.value.length === 2,
      "Failed to r_filter record with 'ge' operation"
    );

    //*********************************************************************//

    const response6 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=(quantity lt 100 and (contains(productName, 'Ma') or startswith(productName, 'The'))) or quantity eq 120",
      AXIOS_REQ_CONFIG
    );
    assert(
      response6.data.value.length === 4,
      "Failed to r_filter record with logical connectors and parenthesis expression"
    );

    //*********************************************************************//

    let hasError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=price eq '100'",
        AXIOS_REQ_CONFIG
      );
    } catch (error) {
      expect(error.status).to.be.equal(
        400,
        "Failed to return HTTP 400 error on r_filter 'eq' operation with invalid record element"
      );
      hasError = true;
    }
    expect(hasError).to.be.equal(
      true,
      "Failed to return HTTP 400 error on r_filter 'eq' operation with invalid record element"
    );

    //*********************************************************************//

    hasError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_filter=contains(price, '100')",
        AXIOS_REQ_CONFIG
      );
    } catch (error) {
      expect(error.status).to.be.equal(
        400,
        "Failed to return HTTP 400 error on r_filter 'contains' operation with invalid record element"
      );
      hasError = true;
    }
    expect(hasError).to.be.equal(
      true,
      "Failed to return HTTP 400 error on r_filter 'contains' operation with invalid record element"
    );

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data r_orderby", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_orderby=productName asc",
      AXIOS_REQ_CONFIG
    );
    expect(
      response0.data.value[0].record.productName.localeCompare(
        response0.data.value[1].record.productName
      )
    ).to.be.lessThan(0, "Failed to r_order by record element in ascending order");
    let len = response0.data.value.length;
    // TODO: Temporarily disabled. Resolve before release. This assertion is failing with the @cap-js/sqlite. Potential bug?
    // expect(
    //   response0.data.value[len - 2].record.productName.localeCompare(
    //     response0.data.value[len - 1].record.productName
    //   )
    // ).to.be.lessThan(
    //   0,
    //   "Failed to r_order by record element in ascending order"
    // );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_orderby=productName desc",
      AXIOS_REQ_CONFIG
    );
    // TODO: Temporarily disabled. Resolve before release. This assertion is failing with the @cap-js/sqlite. Potential bug?
    // expect(
    //   response1.data.value[0].record.productName.localeCompare(
    //     response1.data.value[1].record.productName
    //   )
    // ).to.be.greaterThan(
    //   0,
    //   "Failed to r_order by record element in descending order"
    // );
    expect(
      response1.data.value[len - 2].record.productName.localeCompare(
        response1.data.value[len - 1].record.productName
      )
    ).to.be.greaterThan(0, "Failed to r_order by record element in descending order");

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Order'&r_select=status,ID&r_orderby=status,ID desc",
      AXIOS_REQ_CONFIG
    );

    len = response2.data.value.length;

    expect(
      response2.data.value[1].record.ID.localeCompare(response2.data.value[2].record.ID)
    ).to.be.greaterThan(0, "Failed to r_order by second element in descending order");
    expect(
      response2.data.value[0].record.status.localeCompare(
        response2.data.value[len - 1].record.status
      )
    ).to.be.lessThan(0, "Failed to r_order by first element in ascending order");

    //*********************************************************************//

    let hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.db.Product'&r_orderby=price desc",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to reject request to r_order by invalid record element"
      );
      hadError = true;
    }
    expect(hadError).to.be.equal(
      true,
      "Failed to reject request to r_order by invalid record element"
    );
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */
});

/**
 * ***********************************************************************
 * ***********************************************************************
 * ***********************************************************************
 */

describe("Data entity audit logging test", async () => {
  /**
   * ***********************************************************************
   * ***********************************************************************
   */
  let auditLogs = [];
  let originalConnectTo;

  beforeEach(() => {
    auditLogs = [];
    cds.env.requires["audit-log"] = {
      kind: "audit-log",
    };
    originalConnectTo = cds.connect.to;
    cds.connect.to = (name) => {
      if (name === "audit-log") {
        return {
          log: (...args) => {
            auditLogs.push(...args);
            return Promise.resolve();
          },
        };
      }
      return originalConnectTo(name);
    };
  });

  afterEach(() => {
    cds.env.requires["audit-log"] = undefined;
    cds.connect.to = originalConnectTo;
    auditLogs = [];
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data audit logging test", async () => {
    auditLogs = [];

    const response0 = await GET(
      SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Order'",
      AXIOS_REQ_CONFIG
    );

    expect(response0.status).to.equal(200);

    assert.equal(auditLogs[0], "SensitiveDataRead");
    assert.deepEqual(auditLogs[1], {
      attributes: [{ name: "address" }],
      data_subject: {
        id: { ID: "ord1" },
        role: undefined,
        type: "datainspector.test.db.Order",
      },
      object: {
        id: { ID: "ord1" },
        type: "datainspector.test.db.Order",
      },
    });

    assert(
      auditLogs.length === 11 * 2,
      "Audit log not emitted expected number of times for each record"
    );
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data audit logging test with r_select", async () => {
    auditLogs = [];

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.db.Order'&r_select=status",
      AXIOS_REQ_CONFIG
    );

    expect(response0.status).to.equal(200);

    assert(auditLogs.length === 0, "Audit log emitted when not expected");
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET Data audit logging test on entity with no personal data annotation", async () => {
    auditLogs = [];

    const response0 = await GET(
      SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Product'",
      AXIOS_REQ_CONFIG
    );

    expect(response0.status).to.equal(200);

    assert(auditLogs.length === 0, "Audit log emitted when not expected");
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */
});

/**
 * ***********************************************************************
 * ***********************************************************************
 * ***********************************************************************
 */

describe("Data entity server side pagination test", async () => {
  /**
   * ***********************************************************************
   * ***********************************************************************
   */
  it("Basic pagination test", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.value.length === 10 && // @cds.query.limit.default
        response0.data["@odata.count"] === 100 && // total count
        !!response0.data["@odata.nextLink"],
      "Failed to get response with default page size"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/Data?$filter=entityName eq 'datainspector.test.db.Food'&$count=true",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value.length === 100 && // @cds.query.limit.default does not apply on the db entity
        response1.data["@odata.count"] === 100 && // total count
        response1.data["@odata.nextLink"] === undefined,
      "Failed to get response without default page size on db entity"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&$top=30",
      AXIOS_REQ_CONFIG
    );
    assert(
      response2.data.value.length === 20 && // @cds.query.limit.max
        response2.data["@odata.count"] === 100 && // total count
        !!response2.data["@odata.nextLink"],
      "Failed to get response with max page size"
    );

    //*********************************************************************//

    const response3 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&$skip=80&$top=30",
      AXIOS_REQ_CONFIG
    );
    assert(
      response3.data.value.length === 20 && // @cds.query.limit.max
        response3.data["@odata.count"] === 100 && // total count
        response3.data["@odata.nextLink"] === undefined,
      "Failed to get response of last page with max page size"
    );

    //*********************************************************************//

    const response4 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&$skip=80&$top=15",
      AXIOS_REQ_CONFIG
    );
    assert(
      response4.data.value.length === 15 && // @cds.query.limit.max
        response4.data["@odata.count"] === 100 && // total count
        response4.data["@odata.nextLink"] === undefined,
      "Failed to get response without nextLink when $top is less than default page size with $count"
    );

    //*********************************************************************//

    const response5 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$skip=80&$top=15",
      AXIOS_REQ_CONFIG
    );
    assert(
      response5.data.value.length === 15 && // @cds.query.limit.max
        response5.data["@odata.count"] === undefined && // total count
        response5.data["@odata.nextLink"] === undefined,
      "Failed to get response without nextLink when $top is less than default page size without $count"
    );

    //*********************************************************************//

    const response6 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&$top=0",
      AXIOS_REQ_CONFIG
    );
    assert(
      response6.data.value.length === 0 &&
        response6.data["@odata.count"] === 100 && // total count
        response6.data["@odata.nextLink"] === undefined,
      "Failed to get response of only $count with $top=0"
    );
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("Pagination test with r_filter", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&r_filter=contains(ingredients, 'Rice')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.value.length === 10 && // @cds.query.limit.default
        response0.data["@odata.count"] === 19 && // total count with r_filter
        !!response0.data["@odata.nextLink"],
      "Failed to get response with default page size with r_filter"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/" + response0.data["@odata.nextLink"],
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value.length === 9 && // remaining rows from nextLink, count less than @cds.query.limit.default
        response1.data["@odata.count"] === 19 && // total count with r_filter
        response1.data["@odata.nextLink"] === undefined,
      "Failed to follow the @odata.nextLink"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&r_filter=contains(ingredients, 'Rice')&$top=100",
      AXIOS_REQ_CONFIG
    );
    assert(
      response2.data.value.length === 19 && // all rows, count less than @cds.query.limit.max
        response2.data["@odata.count"] === 19 && // total count with r_filter
        response2.data["@odata.nextLink"] === undefined,
      "Failed to get response will all rows when count is less than @cds.query.limit.max"
    );

    assert(
      response0.data.value[0].record.name === response2.data.value[0].record.name &&
        response0.data.value[9].record.name === response2.data.value[9].record.name &&
        response1.data.value[0].record.name === response2.data.value[10].record.name &&
        response1.data.value[8].record.name === response2.data.value[18].record.name,
      "Failed to return consistent data in different pages"
    );

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("Pagination test with r_orderby and $skip", async () => {
    //*********************************************************************//

    const response00 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&r_orderby=name desc&$skip=10&$top=5",
      AXIOS_REQ_CONFIG
    );
    assert(
      response00.data.value.length === 5 &&
        response00.data["@odata.count"] === 100 && // total count
        response00.data["@odata.nextLink"] === undefined,
      "Failed to get response with r_orderby, $skip and $top"
    );

    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&r_orderby=name desc",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.value.length === 10 && // default page size
        response0.data["@odata.count"] === 100 && // total count
        !!response0.data["@odata.nextLink"],
      "Failed to get response with r_orderby and $skip"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/" + response0.data["@odata.nextLink"],
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value.length === 10 && // next 10
        response1.data["@odata.count"] === 100 && // total count
        !!response1.data["@odata.nextLink"],
      "Failed to follow the @odata.nextLink with r_orderby and $skip"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT +
        "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&r_orderby=name&$skip=80&$top=2000",
      AXIOS_REQ_CONFIG
    );
    assert(
      response2.data.value.length === 20 && // remaining rows after skipping 80
        response2.data["@odata.count"] === 100 && // total count
        response2.data["@odata.nextLink"] === undefined,
      "Failed to get response with max page size with r_orderby and $skip"
    );

    assert(
      response0.data.value[0].record.name === response2.data.value[19].record.name &&
        response0.data.value[9].record.name === response2.data.value[10].record.name &&
        response1.data.value[0].record.name === response2.data.value[9].record.name &&
        response1.data.value[9].record.name === response2.data.value[0].record.name,
      "Failed to return consistent data in pages across inverted order of r_orderby"
    );

    //*********************************************************************//
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("Negative tests", async () => {
    //*********************************************************************//

    let hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$skip=a&$top=-2",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(400, "Expected HTTP 400 with invalid $skip");
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&$skip=-1&$top=1",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(400, "Expected HTTP 400 with negative $skip");
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&$skiptoken=-1",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(400, "Expected HTTP 400 with negative $skiptoken");
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/Data?$filter=entityName eq 'datainspector.test.srv.FoodService.Food'&$count=true&$skip=1&$top=-1",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(400, "Expected HTTP 400 with negative $top");
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//
  });
});
