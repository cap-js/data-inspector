service DataInspectorService {

  /**
   * Represents metadata of each element of an Entity.
   */
  type EntityElement {
    name         : String;
    type         : String;
    length       : Integer;
    defaultValue : String;
    isKey        : Boolean;
    isNotNull    : Boolean;
    isSensitive  : Boolean;
    isVirtual    : Boolean;
  }

  /**
   * Represents metadata of an Entity.
   * Data are exposed through 'Entities' in CAP. 'View' and 'Projection' are also of *kind* 'Entity'.
   * Find more details at https://cap.cloud.sap/docs/cds/csn#entity-definitions
   */

  @cds.persistence.skip: true
  @HideFromDataInspector
  entity EntityDefinition {
    key name       : String;
        title      : String;
        dataSource : String enum {
          Db = 'db';
          Service = 'service';
          Unknown = 'unknown'; // When entity is defined inside the db schema cds file but annotated with @cds.persistence.skip
        };
        elements   : many EntityElement;
  }


  /**
  *  Represents data of each row/record of an Entity.
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
  */

  @cds.persistence.skip: true
  @HideFromDataInspector
  entity Data {
    key entityName : String;
    key recordKey  : String; // In the format: 'keyElementName=value', 'keyElement1Name=value&keyElement2Name=value', etc.
        record     : LargeString @IsJSON;
  }
}
