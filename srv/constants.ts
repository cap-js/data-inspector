export const HIDDEN_ANNOTATION = "@HideFromDataInspector"; // If this annotation is found on an entity or an element, it should be hidden from the data inspector
export const DRAFT_ENTITIES_SUFFIX = ".DraftAdministrativeData"; // Suffix for draft administrative data entities that should be hidden from the data inspector
export const CDS_ENTITIES = ["cds.outbox.Messages"]; // CDS system entities that should be hidden from the data inspector
export const CDS_ELEMENTS = [
  "IsActiveEntity",
  "HasActiveEntity",
  "HasDraftEntity",
  "DraftAdministrativeData_DraftUUID",
  "DraftMessages",
]; // CDS system elements that should be hidden from the data inspector
export const SELECT_DEFAULT_PAGE_ANNOTATION = "@cds.query.limit.default";
export const SELECT_MAX_PAGE_ANNOTATION = "@cds.query.limit.max";
export const DEFAULT_PAGE_SIZE = 1000;
export const MAX_PAGE_SIZE = 1000;
export enum HttpStatusCode {
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  NotAllowed = 405,
  InternalServerError = 500,
  NotImplemented = 501,
}
