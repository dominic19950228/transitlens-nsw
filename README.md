# NSW Transit Platform

A Node.js/TypeScript platform for processing TfNSW GTFS transit data.

## Project Structure

```
src/
  config/
    env.ts              # Environment validation and loading
  download/
    downloadGtfs.ts     # Core GTFS download functionality
  utils/
    fileHash.ts         # SHA-256 file hashing utilities
  cli.ts                # CLI entry point
```

## Step 1: TfNSW Complete GTFS Downloader

Downloads the TfNSW Complete GTFS ZIP file using streaming to avoid loading large files into memory.

### Features

- **Streaming download**: Uses Node.js streams to write files without loading into memory
- **Timeout support**: Configurable request timeout (default: 10 minutes)
- **ZIP validation**: Validates ZIP file signature before finalizing
- **Atomic file operations**: Uses .part files and atomic rename for safe downloads
- **SHA-256 hashing**: Calculates file hash for integrity verification
- **Comprehensive error handling**: Specific error types for various failure scenarios

### Environment Setup

1. Copy the example environment file:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and add your TfNSW API token:
   ```env
   TFNSW_API_TOKEN=your_actual_api_token_here
   ```

3. (Optional) Customize other settings:
   ```env
   TFNSW_GTFS_URL=https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs
   GTFS_DOWNLOAD_DIR=./data/gtfs
   GTFS_TIMEOUT_MS=600000
   ```

### How to Run

```bash
# Install dependencies
npm install

# Run typecheck
npm run typecheck

# Run tests
npm test

# Download GTFS data
npm run gtfs:download
```

### Expected Output

```
GTFS download completed
File: data/gtfs/tfnsw-complete-gtfs-20260714T091530Z-a1b2c3d4e5f6.zip
Size: 283,912,341 bytes
SHA-256: a1b2c3d4e5f6...
Downloaded at: 2026-07-14T09:15:30.000Z
```

### Security Notes

- **Never commit your API token** - The `.env` file is in `.gitignore`
- **Never log the token** - Error messages are sanitized to not expose credentials
- **Use environment variables** - Token is read from `TFNSW_API_TOKEN` env var

### Known Limitations

- This downloader only handles the **Complete GTFS** feed from TfNSW
- File validation is basic (ZIP signature check) - full content validation requires decompression

## What Step 1 Handles

- ✅ Download stream to disk
- ✅ Basic ZIP validation (signature check)
- ✅ SHA-256 calculation
- ✅ Atomic file finalization
- ✅ Environment validation
- ✅ Comprehensive error handling

## What's NOT Included (Future Steps)

These features are not implemented in Step 1 and will be added in subsequent steps:

- ❌ ZIP extraction
- ❌ GTFS CSV parsing
- ❌ PostgreSQL import
- ❌ Feed version activation
- ❌ Scheduler for automated downloads
- ❌ Realtime feeds integration
- ❌ Redis or queue integration

## API Reference

### `downloadGtfs(options)`

Downloads a GTFS ZIP file from TfNSW.

**Options:**
```typescript
interface DownloadGtfsOptions {
  url: string;           // TfNSW API URL
  apiToken: string;      // API authentication token
  outputDirectory: string; // Where to save the downloaded file
  timeoutMs?: number;    // Request timeout in ms (default: 600000)
}
```

**Result:**
```typescript
interface DownloadGtfsResult {
  filePath: string;     // Full path to downloaded file
  fileName: string;      // Filename with timestamp and hash
  sizeBytes: number;     // File size in bytes
  sha256: string;        // SHA-256 hash of file
  downloadedAt: string;  // ISO timestamp of download
  contentType: string | null; // Content-Type from server
}
```

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
