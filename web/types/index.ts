/** DTOs for the TransitLens NSW web API */

export interface ImportDto {
  id: number;
  status: string;
  isActive: boolean;
  sourceDirectory: string;
  startedAt: string | null;
  completedAt: string | null;
  processedRows: number;
  acceptedRows: number;
  rejectedRows: number;
  warnings: number;
  errors: number;
}

export interface ActiveFeedDto {
  id: number;
  sourceDirectory: string;
  sourceArchiveSha256: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface RouteDto {
  routeId: string;
  agencyId: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeType: number;
}

export interface TripDto {
  tripId: string;
  serviceId: string;
  tripHeadsign: string | null;
  directionId: number | null;
  blockId: string | null;
  shapeId: string | null;
}

export interface RouteDetailDto {
  route: RouteDto;
  trips: TripDto[];
}

export interface StopDto {
  stopId: string;
  stopName: string;
  stopLat: number | null;
  stopLon: number | null;
  locationType: number | null;
  parentStation: string | null;
  wheelchairBoarding: number | null;
}

export interface StopTimeRowDto {
  tripId: string;
  arrivalTime: string | null;
  departureTime: string | null;
  stopSequence: number;
  routeId: string;
  tripHeadsign: string | null;
}

export interface StopDetailDto {
  stop: StopDto;
  stopTimes: StopTimeRowDto[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface HealthResponse {
  status: string;
  database: string;
  activeFeedId: number | null;
}

export interface ErrorResponse {
  error: string;
  message: string;
}