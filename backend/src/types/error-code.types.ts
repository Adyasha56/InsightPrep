// Central registry of error codes used across the API.
// Extend this as later phases (auth, generation, research, kits) are added.
export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  ROUTE_NOT_FOUND = "ROUTE_NOT_FOUND",
  AUTH_REQUIRED = "AUTH_REQUIRED",
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}
