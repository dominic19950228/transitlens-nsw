/**
 * GTFS Extractor - Public API
 */

export {
  extractGtfs,
  type ExtractGtfsOptions,
  type ExtractGtfsResult,
} from "./extractGtfs.js";

export {
  ExtractorError,
  ZipFileNotFoundError,
  NotZipFileError,
  EmptyZipError,
  ExtractionFailedError,
  MissingRequiredFileError,
  InvalidGtfsStructureError,
  ZipTooManyFilesError,
  ZipFileTooLargeError,
  ZipTotalTooLargeError,
  UnsafePathError,
  SymlinkNotAllowedError,
  DuplicateFileError,
  ExtractionConflictError,
} from "./extractGtfs.js";

export { isPathSafe } from "./pathSafety.js";