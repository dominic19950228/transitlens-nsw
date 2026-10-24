# TransitLens NSW

A full-stack GTFS ingestion and exploration platform for Transport for NSW timetable data.

TransitLens NSW downloads the TfNSW Complete GTFS feed, securely extracts and validates the archive, streams millions of CSV records through a bounded-memory pipeline, imports supported data into MariaDB using transactional batches, and exposes the active feed through a Next.js web application.

## Highlights

- Streams large GTFS downloads directly to disk
- Uses atomic `.part` files and versioned SHA-256-based filenames
- Protects ZIP extraction against path traversal, symbolic links, duplicate targets, and resource exhaustion
- Validates GTFS files without loading the complete feed into memory
- Imports each feed under a versioned import record
- Activates a new feed only after the complete transaction succeeds
- Preserves the previously active feed when a new import fails
- Stores case-sensitive GTFS identifiers safely
- Provides route, trip, stop, health, and import-history APIs
- Validates API query parameters and database configuration with Zod schemas
- Includes a responsive React, Next.js, and Tailwind CSS frontend
- Includes automated tests for downloader, extraction, validation, database, and formatting logic

## Real TfNSW Dataset Result

The pipeline has been validated against a real TfNSW Complete GTFS feed.

| Dataset | Imported rows |
|---|---:|
| Agencies | 693 |
| Stops | 170,582 |
| Routes | 10,169 |
| Trips | 192,819 |
| Stop Times | 5,182,651 |
| Calendar Records | 2,082 |
| Calendar Exceptions | 27,179 |

The full parser processed **20,958,332 records** with:

- 20,958,332 accepted records
- 0 rejected records
- 0 warnings
- 0 validation errors

Database integrity checks confirmed:

- no trip-to-route orphans
- no stop-time-to-trip orphans
- no stop-time-to-stop orphans
- no missing trip service references

The real feed also contained identifiers that differed only by letter casing. GTFS identifier columns therefore use case-sensitive binary collations.

## Screenshots

Add portfolio screenshots under `docs/screenshots/` before publishing the repository.

Recommended files:

```text
docs/screenshots/
├── dashboard.png
├── routes.png
├── route-detail.png
├── trip-detail.png
├── stops.png
└── import-history.png
```

After adding the images, replace this note with:

```md
![TransitLens NSW dashboard](docs/screenshots/dashboard.png)
![Routes browser](docs/screenshots/routes.png)
![Route details](docs/screenshots/route-detail.png)
![Trip details](docs/screenshots/trip-detail.png)
```

## Architecture

```text
Transport for NSW Open Data API
              |
              v
     Streaming Downloader
              |
              v
      Secure ZIP Extractor
              |
              v
 Streaming Parser and Validator
              |
              v
 Transactional MariaDB Importer
              |
       +------+------+
       |             |
       v             v
 Next.js APIs   Next.js Frontend
```

A successful feed import is stored under a versioned import ID. A new feed becomes active only after all supported tables have been imported successfully.

## Technology

### Backend and data pipeline

- Node.js
- TypeScript
- Native Fetch API
- Node.js streams
- MariaDB / MySQL
- `mysql2`
- `unzipper`
- SHA-256 hashing
- Vitest

### Frontend

- React
- Next.js 16 App Router
- TypeScript
- Tailwind CSS v4
- Zod request and environment validation
- Server-only MariaDB queries

## High-Level Project Structure

```text
.
├── src/
│   ├── cli.ts
│   ├── config/
│   ├── download/
│   ├── extract/
│   ├── parser/
│   ├── database/
│   └── import/
├── database/
│   ├── schema.sql
│   └── migrations/
├── tests/
├── web/
│   ├── app/
│   ├── lib/
│   └── types/
├── env.example
├── package.json
└── README.md
```

The exact internal file layout may evolve, but the pipeline remains separated into downloading, extraction, validation, persistence, and presentation layers.

## Pipeline

### 1. Streaming Download

The downloader retrieves the TfNSW Complete GTFS ZIP without loading the complete response into memory.

It:

- reads the API token from environment variables
- streams the response directly to disk
- writes to a temporary `.part` file
- validates the ZIP signature
- calculates a SHA-256 hash
- creates a versioned filename
- atomically renames the completed download
- removes incomplete files after failures
- preserves previous successful downloads

Downloaded files use this format:

```text
tfnsw-complete-gtfs-YYYYMMDDTHHmmssZ-<sha256-prefix>.zip
```

### 2. Secure ZIP Extraction

The extractor writes archive entries into an isolated temporary directory and finalises the directory only after validation succeeds.

It rejects:

- `../` and `..\` traversal paths
- absolute Unix paths
- Windows drive paths
- UNC paths
- null bytes
- symbolic links
- entries escaping the extraction root
- duplicate normalised GTFS filenames
- configured archive, file-size, or total-size limit violations

Recognised GTFS filenames are matched case-insensitively and normalised to lowercase root-level names.

For example:

```text
wrapper/STOPS.TXT
```

becomes:

```text
stops.txt
```

### 3. Streaming Validation

The parser processes GTFS CSV files in bounded batches rather than retaining the entire dataset in memory.

Validation includes:

- required headers
- required values
- strict numeric parsing
- latitude and longitude ranges
- GTFS dates
- GTFS times, including values greater than 24 hours
- enumerated GTFS fields
- limited issue sampling
- processed, accepted, rejected, warning, and error statistics

### 4. Transactional Import

Validated records are imported into MariaDB using batched inserts inside a transaction.

The importer:

- creates a versioned feed import record
- writes supported GTFS tables in dependency order
- rolls back the complete transaction when an insert fails
- records failed import details
- preserves the previously active feed
- marks the new feed active only after successful completion
- stores a shortened diagnostic message for failed imports

### 5. Web Exploration

The Next.js application reads the currently active feed and exposes:

- feed statistics
- route search and pagination
- route details and trips
- trip details and ordered stops
- stop search and pagination
- stop details and stop times
- import history
- health and data APIs

## GTFS Files

### Required files

```text
agency.txt
stops.txt
routes.txt
trips.txt
stop_times.txt
```

At least one service calendar file must also exist:

```text
calendar.txt
calendar_dates.txt
```

Both may be present.

### Recognised optional files

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

## Feed Manifest

Each completed extraction contains:

```text
feed-manifest.json
```

The manifest records:

- source ZIP filename, path, size, and SHA-256
- extraction timestamp
- extraction directory
- required and optional files
- missing required files
- extracted file sizes and SHA-256 hashes
- total file count
- total uncompressed bytes

The manifest does not contain API tokens.

## Requirements

- Node.js 20 or later
- npm
- MariaDB or MySQL
- A Transport for NSW Open Data API token for download commands
- XAMPP is suitable for local Windows development

Apache is not required for the Node.js database connection.

## Environment Setup

Create a local environment file from the example:

### macOS or Linux

```bash
cp env.example .env
```

### Windows PowerShell

```powershell
Copy-Item env.example .env
```

Configure the root application:

```env
TFNSW_API_TOKEN=your_api_token_here
TFNSW_GTFS_URL=https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs

GTFS_DOWNLOAD_DIR=./data/gtfs
GTFS_DOWNLOAD_TIMEOUT_MS=600000
GTFS_EXTRACTION_DIR=./data/gtfs/extracted

GTFS_MAX_ARCHIVE_ENTRIES=1000
GTFS_MAX_SINGLE_FILE_BYTES=10737418240
GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES=21474836480

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=nsw_transit
DB_CONNECTION_LIMIT=5
```

`TFNSW_API_TOKEN` is required only for download commands.

An empty `DB_PASSWORD` is valid for a default local XAMPP installation, but a password should be used in any shared or hosted environment.

## Installation

Install the root application:

```bash
npm install
```

Install the web application:

```bash
cd web
npm install
```

## Database Setup

1. Start MariaDB or MySQL.
2. Create the database:

```sql
CREATE DATABASE nsw_transit
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

3. Configure the database environment variables.
4. Run the migration command:

```bash
npm run db:migrate
```

The schema contains these GTFS tables:

```text
gtfs_feed_imports
gtfs_agencies
gtfs_stops
gtfs_routes
gtfs_trips
gtfs_stop_times
gtfs_calendar
gtfs_calendar_dates
gtfs_shapes
gtfs_feed_info
gtfs_frequencies
gtfs_transfers
```

GTFS identifier columns use case-sensitive collations where necessary.

## Commands

### Type check

```bash
npm run typecheck
```

### Run tests

```bash
npm test
```

### Watch tests

```bash
npm run test:watch
```

### Download the TfNSW feed

```bash
npm run gtfs:download
```

### Extract a specific ZIP

```bash
npm run gtfs:extract -- ./data/gtfs/<feed-file>.zip
```

### Extract the latest completed download

```bash
npm run gtfs:extract:latest
```

### Run database migrations

```bash
npm run db:migrate
```

Run this command to view all currently available validation and import scripts:

```bash
npm run
```

The CLI provides command-specific configuration checks, so extraction and database operations do not require a TfNSW API token.

## Web Application

The frontend is located under `web/`.

Create `web/.env.local`:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=nsw_transit
```

Start the development server:

```bash
cd web
npm run dev
```

Open:

```text
http://localhost:3000
```

The web application requires the database to be running with a completed active feed import.

### Pages

| Path | Description |
|---|---|
| `/` | Dashboard with active-feed statistics |
| `/routes` | Paginated route list with search |
| `/routes/[routeId]` | Route details and associated trips |
| `/trips/[tripId]` | Trip details and ordered stop sequence |
| `/stops` | Paginated stop list with search |
| `/stops/[stopId]` | Stop details and associated stop times |
| `/imports` | Feed import history |

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Database health check |
| `/api/imports` | GET | Feed import history |
| `/api/imports/active` | GET | Currently active feed |
| `/api/routes` | GET | Paginated routes using `search`, `limit`, and `offset` |
| `/api/routes/[routeId]` | GET | Route details with trips |
| `/api/trips/[tripId]` | GET | Trip details with ordered stop times |
| `/api/stops` | GET | Paginated stops using `search`, `limit`, and `offset` |
| `/api/stops/[stopId]` | GET | Stop details with stop times |

Paginated endpoints validate `search`, `limit`, and `offset` with a shared Zod schema before any database work:

- `limit` must be an integer between 1 and 200 (default 50)
- `offset` must be an integer of 0 or greater (default 0)
- `search` is trimmed and limited to 200 characters

Invalid values return `400` with field-level details:

```json
{
  "error": "INVALID_QUERY",
  "message": "Invalid query parameters.",
  "details": [
    { "field": "limit", "message": "Too big: expected number to be <=200" }
  ]
}
```

## Testing

Tests do not call the production TfNSW API.

The test suite uses:

- mocked HTTP responses
- local HTTP test servers
- temporary directories
- generated ZIP fixtures
- small GTFS fixtures
- database configuration mocks
- focused formatting and API helper tests

Coverage includes:

- successful streaming downloads
- authentication headers
- missing and invalid tokens
- timeout and network failures
- invalid ZIP responses
- temporary file cleanup
- SHA-256 generation
- unsafe extraction paths
- symbolic links
- duplicate filenames
- archive resource limits
- manifest generation
- required GTFS files
- CSV and field validation
- transactional import behavior
- failed import diagnostics
- case-sensitive GTFS identifiers
- API query validation and database environment validation
- frontend formatting helpers

## Engineering Decisions

### Streaming instead of full-file loading

The production TfNSW feed contains millions of records. Downloads, extraction, parsing, and importing therefore use streams and bounded batches to control memory usage.

### Atomic filesystem operations

Downloads and extractions are first written to temporary `.part` locations. They become visible as completed artifacts only after validation succeeds.

### Transactional feed activation

A feed is marked active only after all supported data has been imported successfully. A failed import cannot replace the previously active feed.

### Case-sensitive GTFS identifiers

The real TfNSW dataset contains identifiers that differ only by letter casing. Relevant database columns therefore use binary collations.

### Defensive archive handling

ZIP entry names are normalised and validated before any file is written. Unsafe paths, symbolic links, duplicate targets, and configured resource-limit violations are rejected.

### Typed request and configuration validation

API pagination parameters and database environment variables are parsed with Zod schemas in `web/lib/queryParams.ts` and `web/lib/env.ts`. Query validation runs before any database access, so a malformed request fails fast with a `400` and field-level details instead of reaching MariaDB. Environment validation stays lazy, so production builds never require database credentials, while a misconfigured deployment fails with one descriptive error.

### Safe diagnostics

CLI and database failure messages provide useful context without including API tokens or unnecessary internal details.

## Security and Repository Hygiene

The following files and directories must not be committed:

```text
.env
web/.env.local
data/gtfs/*.zip
data/gtfs/*.part
data/gtfs/extracted/
data/test-gtfs/
coverage/
.next/
web/.next/
node_modules/
web/node_modules/
```

Never commit:

- TfNSW API tokens
- real database passwords
- downloaded GTFS archives
- extracted production GTFS files
- database dumps containing imported data
- private keys or certificates
- private LAN addresses
- company-internal source code or data

SQL schema and migration files are intentionally tracked because they define the application database structure.

## Current Limitations

- The project currently uses static GTFS timetable data, not GTFS-Realtime.
- Shape records are parsed but are intentionally skipped by the current database import path.
- `pathways.txt` and `levels.txt` may be extracted but are not currently persisted.
- The web interface is designed for data exploration rather than journey planning.
- The project does not include authentication or multi-user access control.
- The complete TfNSW feed is not included in the repository.
- Production deployment and managed database configuration are outside the current portfolio scope.

## Data Attribution

This project uses public transport timetable data provided by Transport for NSW through the Transport Open Data Hub.

The production GTFS dataset is not distributed with this repository. Users must obtain their own TfNSW API credentials and download the feed using the provided CLI.

Transport for NSW data remains subject to its applicable data licence and attribution requirements.

## License

No source-code licence is included by default.

Before publishing this repository as an open-source project, add a `LICENSE` file. The MIT License is a suitable choice for a portfolio project that permits reuse while preserving attribution and copyright notices.

## Portfolio Focus

TransitLens NSW demonstrates:

- large-file streaming
- secure archive processing
- typed validation
- transactional database imports
- schema migration design
- production-size data handling
- defensive error handling
- REST-style APIs
- React and Next.js frontend development
- Tailwind CSS UI styling
- automated testing
