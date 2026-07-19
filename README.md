# NSW Transit Platform

A Node.js and TypeScript platform for downloading, validating, extracting, and processing Transport for NSW GTFS timetable data.

The project is being developed incrementally:

* Step 1: Download the TfNSW Complete GTFS ZIP
* Step 2: Safely extract and validate the GTFS archive
* Step 3: Stream and validate GTFS CSV records
* Step 4: Import validated GTFS data into MariaDB
* Later: Expose APIs and build a React frontend

## Technology

* Node.js
* TypeScript
* Native Fetch API
* Node.js streams
* Vitest
* `unzipper`
* SHA-256 file hashing

## Project Structure

```text
src/
    cli.ts

    config/
        env.ts

    download/
        downloadGtfs.ts

    extract/
        extractGtfs.ts
        errors.ts
        manifest.ts
        pathSafety.ts
        index.ts

    utils/
        fileHash.ts

tests/
    downloadGtfs.test.ts
    extractGtfs.test.ts
```

The exact structure may change as later stages are added.

---

# Step 1: TfNSW Complete GTFS Downloader

Step 1 downloads the TfNSW Complete GTFS feed without loading the complete ZIP file into memory.

## Features

* Streams the API response directly to disk
* Reads the TfNSW API token from environment variables
* Supports configurable request timeout
* Writes downloads to a temporary `.part` file
* Checks the downloaded ZIP signature
* Calculates a SHA-256 hash
* Generates a versioned filename
* Atomically renames the completed download
* Removes incomplete temporary files after failure
* Preserves previous successful downloads
* Returns typed download metadata
* Provides safe CLI errors
* Includes automated tests

## TfNSW Endpoint

```text
https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs
```

The request uses:

```http
Authorization: apikey <TFNSW_API_TOKEN>
Accept: application/zip
```

The API token must never be stored in source code or committed to Git.

## Download Output

Downloaded files use a versioned filename:

```text
tfnsw-complete-gtfs-YYYYMMDDTHHmmssZ-<sha256-prefix>.zip
```

Example:

```text
tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6.zip
```

Temporary downloads use the `.part` extension and are removed if the download fails.

---

# Step 2: Secure GTFS ZIP Extraction

Step 2 extracts a completed GTFS ZIP into an isolated, versioned directory.

It validates the archive structure before making the extracted feed available.

## Features

* Streams ZIP entries to disk
* Uses an isolated temporary extraction directory
* Protects against unsafe archive paths
* Rejects symbolic links
* Rejects duplicate normalized GTFS filenames
* Validates required GTFS files
* Enforces archive resource limits
* Calculates SHA-256 hashes for extracted files
* Generates `feed-manifest.json`
* Atomically finalises the extraction directory
* Cleans incomplete extraction directories after failure
* Preserves the source ZIP
* Preserves previous successful extractions
* Supports idempotent extraction
* Includes automated tests

## Required GTFS Files

The following files are required:

```text
agency.txt
stops.txt
routes.txt
trips.txt
stop_times.txt
```

At least one of these service calendar files must also exist:

```text
calendar.txt
calendar_dates.txt
```

Both may be present.

## Optional GTFS Files

Optional files may include:

```text
shapes.txt
feed_info.txt
frequencies.txt
transfers.txt
pathways.txt
levels.txt
translations.txt
attributions.txt
fare_attributes.txt
fare_rules.txt
```

Missing optional files do not cause extraction failure.

## Extraction Output

Example directory structure:

```text
data/
    gtfs/
        tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6.zip

        extracted/
            tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6/
                agency.txt
                stops.txt
                routes.txt
                trips.txt
                stop_times.txt
                calendar.txt
                shapes.txt
                feed-manifest.json
```

Extraction initially occurs inside a temporary sibling directory:

```text
.tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6.part/
```

The temporary directory is renamed only after all extraction and validation steps succeed.

## Archive Security

The extractor rejects archive entries containing:

```text
../
..\
absolute Unix paths
Windows drive paths
UNC paths
null bytes
symbolic links
paths escaping the extraction root
```

Recognised GTFS filenames are matched case-insensitively and normalised to lowercase root-level output names.

For example:

```text
wrapper/STOPS.TXT
```

is extracted as:

```text
stops.txt
```

If multiple archive entries resolve to the same normalised GTFS filename, extraction fails instead of overwriting a file.

## Resource Limits

The extractor supports configurable limits for:

* Maximum archive entries
* Maximum individual uncompressed file size
* Maximum total uncompressed size

Limits are checked using declared uncompressed sizes where available and actual bytes written during extraction.

---

# Feed Manifest

Each completed extraction includes:

```text
feed-manifest.json
```

The manifest records information about the source ZIP and extracted GTFS files.

Example structure:

```json
{
    "schemaVersion": 1,
    "sourceZip": {
        "fileName": "tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6.zip",
        "filePath": "data/gtfs/tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6.zip",
        "sizeBytes": 283912341,
        "sha256": "full-source-zip-sha256"
    },
    "extractedAt": "2026-07-18T03:20:00.000Z",
    "extractionDirectory": "data/gtfs/extracted/tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6",
    "requiredFiles": [
        "agency.txt",
        "stops.txt",
        "routes.txt",
        "trips.txt",
        "stop_times.txt"
    ],
    "optionalFiles": [
        "calendar.txt",
        "calendar_dates.txt",
        "shapes.txt"
    ],
    "missingRequiredFiles": [],
    "files": [
        {
            "fileName": "agency.txt",
            "relativePath": "agency.txt",
            "sizeBytes": 1234,
            "sha256": "file-sha256"
        }
    ],
    "totalFiles": 8,
    "totalUncompressedBytes": 1234567890
}
```

The manifest does not contain API tokens or temporary directory paths.

---

# Environment Setup

Create a local environment file:

```bash
cp env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item env.example .env
```

Add your TfNSW API token:

```env
TFNSW_API_TOKEN=your_api_token_here
```

Available environment variables:

```env
TFNSW_API_TOKEN=your_api_token_here

TFNSW_GTFS_URL=https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs

GTFS_DOWNLOAD_DIR=./data/gtfs

GTFS_DOWNLOAD_TIMEOUT_MS=600000

GTFS_EXTRACTION_DIR=./data/gtfs/extracted

GTFS_MAX_ARCHIVE_ENTRIES=1000

GTFS_MAX_SINGLE_FILE_BYTES=10737418240

GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES=21474836480
```

`TFNSW_API_TOKEN` is required only for download commands.

Extraction commands do not require an API token.

---

# Installation

```bash
npm install
```

---

# Commands

## Type Check

```bash
npm run typecheck
```

## Run Tests

```bash
npm test
```

## Watch Tests

```bash
npm run test:watch
```

## Download GTFS

```bash
npm run gtfs:download
```

Expected output:

```text
GTFS download completed
File: data/gtfs/tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6.zip
Size: 283,912,341 bytes
SHA-256: a1b2c3d4e5f6...
Downloaded at: 2026-07-18T03:15:00.000Z
```

## Extract a Specific ZIP

```bash
npm run gtfs:extract -- ./data/gtfs/tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6.zip
```

Expected output:

```text
GTFS extraction completed
Source: data/gtfs/tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6.zip
Directory: data/gtfs/extracted/tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6
Files: 8
Uncompressed size: 1,234,567,890 bytes
Manifest: data/gtfs/extracted/tfnsw-complete-gtfs-20260718T031500Z-a1b2c3d4e5f6/feed-manifest.json
```

## Extract the Latest Download

```bash
npm run gtfs:extract:latest
```

The command:

1. Scans the configured GTFS download directory.
2. Considers only completed `.zip` files.
3. Ignores `.part` files.
4. Selects the newest ZIP by modification time.
5. Extracts and validates the selected feed.

---

# Command-Specific Configuration

Configuration validation is command-specific.

## Download

Requires:

```env
TFNSW_API_TOKEN
```

Uses:

```env
TFNSW_GTFS_URL
GTFS_DOWNLOAD_DIR
GTFS_DOWNLOAD_TIMEOUT_MS
```

## Extract

Does not require:

```env
TFNSW_API_TOKEN
```

Uses:

```env
GTFS_DOWNLOAD_DIR
GTFS_EXTRACTION_DIR
GTFS_MAX_ARCHIVE_ENTRIES
GTFS_MAX_SINGLE_FILE_BYTES
GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES
```

---

# Error Handling

The downloader provides errors for cases such as:

* Missing API token
* Invalid URL
* Request timeout
* Network failure
* HTTP 401 or 403
* Unexpected response type
* Invalid ZIP signature
* Disk write failure
* Hashing failure
* Atomic rename failure

The extractor provides errors for cases such as:

* Source ZIP not found
* Invalid ZIP archive
* Unsafe archive path
* Symbolic-link entry
* Duplicate GTFS filename
* Missing required GTFS file
* Missing service calendar
* Archive entry limit exceeded
* File size limit exceeded
* Total extraction size exceeded
* File write failure
* Manifest write failure
* Extraction directory conflict
* Atomic finalisation failure

CLI errors are designed to avoid exposing API tokens or unnecessary internal details.

---

# Testing

Tests must not call the production TfNSW API.

The test suite uses mocked HTTP responses, local HTTP test servers, temporary directories, and small generated ZIP fixtures.

Step 1 tests cover:

* Successful streaming download
* Authorization header
* Missing token
* HTTP errors
* HTML or JSON error responses
* Invalid ZIP content
* Timeout handling
* Temporary file cleanup
* SHA-256 calculation
* Versioned filename generation
* Existing download preservation

Step 2 tests cover:

* Successful extraction
* Wrapper directories
* Uppercase filenames
* Required GTFS files
* Calendar alternatives
* Duplicate filenames
* Unsafe paths
* Symbolic links
* Archive limits
* Cleanup after failure
* Manifest generation
* Hash verification
* Stable manifest ordering
* Atomic finalisation
* Idempotent extraction
* Latest ZIP selection

---

# Git Security

The following files and directories must not be committed:

```text
.env
data/gtfs/*.zip
data/gtfs/*.part
data/gtfs/extracted/
data/test-gtfs/
coverage/
```

Never commit:

* TfNSW API tokens
* Downloaded GTFS archives
* Extracted GTFS files
* Personal Continue configurations
* Private LAN addresses
* Local model configuration

---

# Current Limitations

Step 1 validates only the downloaded ZIP container.

Step 2 validates:

* Archive structure
* Archive path safety
* Resource limits
* Required GTFS filenames
* Extracted file hashes

Step 2 does not validate:

* CSV headers
* CSV field types
* Required row values
* GTFS time formats
* GTFS date formats
* Foreign-key relationships
* Service calendar logic
* Route or stop consistency

Those checks belong to Step 3.

---

# Next Step

## Step 3: Streaming GTFS CSV Validation

The next stage will:

* Stream CSV records without retaining the full feed in memory
* Validate required headers
* Validate required fields
* Validate strict numeric values
* Validate latitude and longitude
* Validate GTFS dates
* Validate GTFS times greater than 24 hours
* Validate enumerated GTFS fields
* Process records in bounded batches
* Return validation statistics and limited issue samples

Step 3 will not persist records.

GTFS batch import will be implemented in a later step.

---

# Step 4: Local MariaDB Setup

Step 4A connects the Node.js application to a local XAMPP MariaDB database.

## Requirements

* XAMPP with MySQL/MariaDB running
* Apache is not required for the Node.js database connection

## Database Setup

1. Start MySQL in XAMPP.
2. Confirm the `nsw_transit` database exists.
3. Configure the following environment variables.
4. Run the migration command.

## Database Environment Variables

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=nsw_transit
DB_CONNECTION_LIMIT=5
```

An empty `DB_PASSWORD` is valid.

## Run Database Migration

```bash
npm run db:migrate
```

Expected output:

```text
Database migration completed
Database: nsw_transit
Server: MariaDB 10.4.11
Character set: utf8mb4
Collation: utf8mb4_unicode_ci
Tables verified: 12
```

## Database Tables

The schema includes these 12 GTFS tables:

* gtfs_feed_imports
* gtfs_agencies
* gtfs_stops
* gtfs_routes
* gtfs_trips
* gtfs_stop_times
* gtfs_calendar
* gtfs_calendar_dates
* gtfs_shapes
* gtfs_feed_info
* gtfs_frequencies
* gtfs_transfers
