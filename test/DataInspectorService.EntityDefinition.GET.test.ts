import cds from "@sap/cds";
const { expect, assert, GET } = cds.test(__dirname);

const SERVICE_ENDPOINT = "/odata/v4/data-inspector";
const AXIOS_REQ_CONFIG = {
  auth: {
    username: "test",
    password: "12345",
  },
};

describe("Authorization test - ERPCDXCNS-3121, ERPCDXCNS-3122", async () => {
  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET authorization scope", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition",
      AXIOS_REQ_CONFIG
    );
    expect(response0.status).to.be.equal(
      200,
      "Failed to access endpoint with authorization scope"
    );

    //*********************************************************************//
    let hadError = false;
    try {
      await GET(SERVICE_ENDPOINT + "/EntityDefinition", {
        auth: {
          username: "test-no-auth",
          password: "12345",
        },
      });
    } catch (e) {
      expect(e.status).to.be.equal(
        403,
        "Able to access endpoint without authorization scope"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(SERVICE_ENDPOINT + "/EntityDefinition");
    } catch (e) {
      expect(e.status).to.be.equal(
        401,
        "Able to access endpoint without authentication"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;
  });
});

/**
 * ***********************************************************************
 * ***********************************************************************
 */

describe("EntityDefinition - ERPCDXCNS-3121, ERPCDXCNS-3122, ERPCDXCNS-3664", async () => {
  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET EntityDefinition Query by ID", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition('datainspector.test.db.Product')",
      AXIOS_REQ_CONFIG
    );
    expect(response0.data.name).to.be.equal(
      "datainspector.test.db.Product",
      "Failed to get entity by key (name) and select all elements '*'"
    );
    assert(
      response0.data.name === "datainspector.test.db.Product" &&
        response0.data.title &&
        response0.data.elements &&
        response0.data.dataSource,
      "Failed to get entity by key (name) and select all elements '*'"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition('datainspector.test.db.Product')?$select=name",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.name === "datainspector.test.db.Product" &&
        !response1.data.title &&
        !response1.data.elements &&
        !response1.data.dataSource,
      "Failed to get entity by key (name) and select column 'name' only"
    );

    //*********************************************************************//

    const response3 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition('datainspector.test.db.Product')?$select=title",
      AXIOS_REQ_CONFIG
    );
    assert(
      response3.data.name === "datainspector.test.db.Product" && // key is always returned
        response3.data.title &&
        !response3.data.elements &&
        !response3.data.dataSource,
      "Failed to get entity by key (name) and select column 'title' only"
    );

    //*********************************************************************//

    const response5 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition('datainspector.test.db.Product')?$select=elements",
      AXIOS_REQ_CONFIG
    );
    assert(
      response5.data.name === "datainspector.test.db.Product" && // key is always returned
        !response5.data.title &&
        response5.data.elements &&
        !response5.data.dataSource,
      "Failed to get entity by key (name) and select column 'elements' only"
    );

    //*********************************************************************//

    const response6 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition('datainspector.test.db.Product')?$select=dataSource",
      AXIOS_REQ_CONFIG
    );
    assert(
      response6.data.name === "datainspector.test.db.Product" && // key is always returned
        !response6.data.title &&
        !response6.data.elements &&
        response6.data.dataSource,
      "Failed to get entity by key (name) and select column 'dataSource' only"
    );

    //*********************************************************************//

    let hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT + "/EntityDefinition('datainspector.test.db.Orange')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        404,
        "Failed to return HTTP 404 code for GET non-existent key (name)"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET EntityDefinitions $count", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$count=true",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.value.length === 13 &&
        response0.data["@odata.count"] === 13,
      "Failed to get all entities with $count"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value.length === 13 &&
        response1.data["@odata.count"] === undefined,
      "Failed to get all entities without $count"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition/$count",
      AXIOS_REQ_CONFIG
    );
    expect(response2.data).to.be.equal(
      13,
      "Failed to get only the count of total number of entities"
    );
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET EntityDefinitions $select", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.value[1].name &&
        response0.data.value[1].title &&
        response0.data.value[1].elements &&
        response0.data.value[1].dataSource,
      "Failed to select all elements '*'"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$select=name",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value[0].name &&
        !response1.data.value[0].title &&
        !response1.data.value[0].elements &&
        !response1.data.value[0].dataSource,
      "Failed to select column 'name' only"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$select=title",
      AXIOS_REQ_CONFIG
    );
    assert(
      response2.data.value[0].name && // key is always returned
        response2.data.value[0].title !== undefined &&
        !response2.data.value[0].elements &&
        !response2.data.value[0].dataSource,
      "Failed to select column 'title' only"
    );

    //*********************************************************************//

    const response4 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$select=elements",
      AXIOS_REQ_CONFIG
    );
    assert(
      response4.data.value[0].name && // key is always returned
        !response4.data.value[0].title &&
        response4.data.value[0].elements &&
        !response4.data.value[0].dataSource,
      "Failed to select column 'elements' only"
    );

    //*********************************************************************//

    const response5 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$select=dataSource",
      AXIOS_REQ_CONFIG
    );
    assert(
      response5.data.value[0].name && // key is always returned
        !response5.data.value[0].title &&
        !response5.data.value[0].elements &&
        response5.data.value[0].dataSource,
      "Failed to select column 'dataSource' only"
    );
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET EntityDefinitions $filter", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition?$filter=name eq 'datainspector.test.db.Product'",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.value.length === 1 &&
        response0.data.value[0].name === "datainspector.test.db.Product",
      "Failed to filter entity by 'name' eq"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$filter=contains(name, 'Product')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value.length > 1 &&
        response1.data.value[0].name.includes("Product"),
      "Failed to filter entity by 'name' contains"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition?$filter=name eq 'datainspector.test.db.Offer'",
      AXIOS_REQ_CONFIG
    );
    assert(
      response2.data.value.length === 0,
      "Failed to filter non-existent entity by 'name' eq"
    );

    //*********************************************************************//

    const response3 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition?$filter=contains(name, 'datainspector.test.db.Offer')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response3.data.value.length === 0,
      "Failed to filter non-existent entity by 'name' contains"
    );

    //*********************************************************************//

    const response6 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$filter=title eq 'Products Table'",
      AXIOS_REQ_CONFIG
    );
    assert(
      response6.data.value.length === 3 &&
        response6.data.value[0].title === "Products Table",
      "Failed to filter entity by 'title' eq"
    );

    //*********************************************************************//

    const response7 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$filter=contains(title, 'Product')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response7.data.value.length === 4 &&
        response7.data.value[0].title.includes("Products"),
      "Failed to filter entity by 'title' contains"
    );

    //*********************************************************************//

    const response8 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$filter=dataSource eq 'db'",
      AXIOS_REQ_CONFIG
    );
    assert(
      response8.data.value.length === 6 &&
        response8.data.value[0].dataSource === "db",
      "Failed to filter entity by 'dataSource' eq"
    );

    //*********************************************************************//

    const response9 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition?$filter=contains(dataSource, 'serv')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response9.data.value.length === 6 &&
        response9.data.value[0].dataSource === "service",
      "Failed to filter entity by 'dataSource' contains"
    );

    //*********************************************************************//

    const response10 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition?$filter=contains(dataSource, 'unknown')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response10.data.value.length === 1 &&
        response10.data.value[0].dataSource === "unknown",
      "Failed to filter entity by 'dataSource' contains"
    );

    //*********************************************************************//

    const response11 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition?$filter=dataSource eq 'service' and contains(name, 'Product')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response11.data.value.length === 3 &&
        response11.data.value[0].dataSource === "service",
      "[Special $filter 'and' support for UI use case] Failed to filter entity by 'dataSource' eq AND 'name' contains"
    );

    //*********************************************************************//

    const response12 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition?$filter=contains(name, 'Product') and dataSource eq 'service'",
      AXIOS_REQ_CONFIG
    );
    assert(
      response12.data.value.length === 3 &&
        response12.data.value[0].dataSource === "service",
      "[Special $filter 'and' support for UI use case] Failed to filter entity by 'name' contains AND 'dataSource' eq"
    );

    //*********************************************************************//

    let hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/EntityDefinition?$filter=dataSource eq 'service' and contains(title, 'Product')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "[Special $filter 'and' support for UI use case] Failed to reject request to filter entity by 'dataSource' eq AND 'title' contains (not 'name')"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT + "/EntityDefinition?$filter=elements in ('test')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to reject request to filter by 'elements' eq"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/EntityDefinition?$filter=contains(elements, 'test')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to reject request to filter by 'elements' contains"
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

  it("GET EntityDefinitions $orderby", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$orderby=name",
      AXIOS_REQ_CONFIG
    );
    expect(
      response0.data.value[0].name.localeCompare(response0.data.value[1].name)
    ).to.be.lessThan(0, "Failed to order by column 'name' ascending");

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$orderby=name desc",
      AXIOS_REQ_CONFIG
    );
    expect(
      response1.data.value[0].name.localeCompare(response1.data.value[1].name)
    ).to.be.greaterThan(0, "Failed to order by column 'name' descending");

    //*********************************************************************//

    let hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT + "/EntityDefinition?$orderby=title",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to reject request to order by 'title'"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;
    //*********************************************************************//
    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT + "/EntityDefinition?$orderby=elements",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to reject request to order by 'elements'"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;
    //*********************************************************************//
    hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT + "/EntityDefinition?$orderby=dataSource",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        400,
        "Failed to reject request to order by 'dataSource'"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET EntityDefinitions $skip $top", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$skip=0&$top=10",
      AXIOS_REQ_CONFIG
    );
    expect(response0.data.value.length).to.be.equal(
      10,
      "Failed to return paginated entries with skip=0 top=10"
    );

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$skip=0&$top=4",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value.length === 4 &&
        response1.data.value[0].name === response0.data.value[0].name &&
        response1.data.value[3].name === response0.data.value[3].name,
      "Failed to return paginated entries with skip=0 top=4"
    );

    //*********************************************************************//

    const response2 = await GET(
      SERVICE_ENDPOINT + "/EntityDefinition?$skip=4&$top=4",
      AXIOS_REQ_CONFIG
    );
    assert(
      response2.data.value.length === 4 &&
        response2.data.value[0].name === response0.data.value[4].name &&
        response2.data.value[3].name === response0.data.value[7].name,
      "Failed to return paginated entries with skip=4 top=4"
    );
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET EntityDefinitions.elements", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition('datainspector.test.db.CdsCoreTypes')?$select=elements",
      AXIOS_REQ_CONFIG
    );
    assert(
      response0.data.elements.length === 19,
      "Failed to get all elements of an entity"
    );
    const uuid = response0.data.elements.filter((x) => x.name === "uuid")[0];
    expect(uuid.isKey).to.be.true;

    const boolean = response0.data.elements.filter(
      (x) => x.name === "boolean"
    )[0];
    expect(boolean.isNotNull).to.be.true;

    const integer = response0.data.elements.filter(
      (x) => x.name === "integer"
    )[0];
    expect(integer.defaultValue).to.be.equal(8);

    const date = response0.data.elements.filter((x) => x.name === "date")[0];
    expect(date.isSensitive).to.be.true;

    const hiddenField = response0.data.elements.filter(
      (x) => x.name === "hiddenField"
    );
    expect(hiddenField.length).to.be.equal(0);

    const virtualField = response0.data.elements.filter(
      (x) => x.name === "virtualField"
    )[0];
    expect(virtualField.isVirtual).to.be.true;

    const string = response0.data.elements.filter(
      (x) => x.name === "string"
    )[0];
    expect(string.length).to.be.equal(88);
    expect(string.type).to.be.equal("cds.String");
    expect(string.isKey).to.be.false;
    expect(string.isNotNull).to.be.false;
    expect(string.defaultValue).to.be.null;
    expect(string.isSensitive).to.be.false;
    expect(string.isVirtual).to.be.false;
  });

  /**
   * ***********************************************************************
   * ***********************************************************************
   */

  it("GET DraftAdministrativeData Entities", async () => {
    //*********************************************************************//

    const response0 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition('datainspector.test.srv.ProductService.Product')",
      AXIOS_REQ_CONFIG
    );
    expect(response0.data.name).to.be.equal(
      "datainspector.test.srv.ProductService.Product",
      "Failed to get entity by name"
    );

    //*********************************************************************//

    let hadError = false;
    try {
      await GET(
        SERVICE_ENDPOINT +
          "/EntityDefinition('datainspector.test.srv.ProductService.Product.DraftAdministrativeData')",
        AXIOS_REQ_CONFIG
      );
    } catch (e) {
      expect(e.status).to.be.equal(
        404,
        "Failed to return HTTP 404 code for GET DraftAdministrativeData entity by name"
      );
      hadError = true;
    }
    expect(hadError).to.be.true;

    //*********************************************************************//

    const response1 = await GET(
      SERVICE_ENDPOINT +
        "/EntityDefinition?$filter=contains(name, '.DraftAdministrativeData')",
      AXIOS_REQ_CONFIG
    );
    assert(
      response1.data.value.length === 0,
      "Failed to hide DraftAdministrativeData entities"
    );

    //*********************************************************************//
  });
});
