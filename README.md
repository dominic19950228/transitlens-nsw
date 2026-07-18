### Error Types

| Error Type | Cause |
|------------|-------|
| `MissingTokenError` | API token is empty or missing |
| `InvalidURLError` | URL is malformed |
| `TimeoutError` | Request exceeded timeout |
| `NetworkError` | Network connectivity issue |
| `UnauthorizedError` | HTTP 401 response |
| `ForbiddenError` | HTTP 403 response |
| `HttpError` | Non-2xx HTTP response |
| `EmptyResponseError` | Server returned empty body |
| `ContentTypeError` | Unexpected Content-Type |
| `NotZipFileError` | Response is not a valid ZIP |
| `DiskWriteError` | Failed to write file |
| `HashingFailureError` | SHA-256 calculation failed |
| `AtomicRenameError` | Failed to rename .part to .zip |

---

### `extractGtfs(options)`

Extracts a GTFS ZIP file.

**Options:**

