import { describe, it, expect } from 'vitest';
import { validateCoordinates } from './mapHelpers';

describe('validateCoordinates', () => {
  it('validates correct numeric coordinates', () => {
    expect(validateCoordinates('1', 'Test', -33.8, 151.2)).toEqual({
      stopId: '1', stopName: 'Test', latitude: -33.8, longitude: 151.2
    });
  });

  it('validates string coordinates including trailing zeros', () => {
    expect(validateCoordinates('1', 'Test', '-33.800000', '151.200000')).toEqual({
      stopId: '1', stopName: 'Test', latitude: -33.8, longitude: 151.2
    });
  });

  it('rejects partially numeric strings', () => {
    expect(validateCoordinates('1', 'Test', '151.2abc', 0)).toBeNull();
  });

  it('rejects invalid inputs', () => {
    expect(validateCoordinates('1', 'Test', NaN, 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', Infinity, 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', -Infinity, 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', null, 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', undefined, 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', '', 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', '   ', 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', 'abc', 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', 0, null)).toBeNull();
    expect(validateCoordinates('1', 'Test', 0, undefined)).toBeNull();
    expect(validateCoordinates('1', 'Test', 0, '')).toBeNull();
    expect(validateCoordinates('1', 'Test', 0, '   ')).toBeNull();
    expect(validateCoordinates('1', 'Test', 0, '151.2abc')).toBeNull();
  });

  it('validates boundary values', () => {
    expect(validateCoordinates('1', 'Test', -90, 180)).not.toBeNull();
    expect(validateCoordinates('1', 'Test', 90, -180)).not.toBeNull();
  });

  it('rejects out of bounds', () => {
    expect(validateCoordinates('1', 'Test', 91, 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', -91, 0)).toBeNull();
    expect(validateCoordinates('1', 'Test', 0, 181)).toBeNull();
    expect(validateCoordinates('1', 'Test', 0, -181)).toBeNull();
  });

  it('handles empty names', () => {
    expect(validateCoordinates('1', '  ', 0, 0)?.stopName).toBe("Unnamed stop");
  });
});