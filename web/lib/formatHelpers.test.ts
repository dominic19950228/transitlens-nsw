import { describe, it, expect } from "vitest";
import { formatDirection, formatPickupType, formatDropOffType } from "./formatHelpers";

describe("formatDirection", () => {
  it("returns Outbound for direction 0", () => {
    expect(formatDirection(0)).toBe("Outbound");
  });

  it("returns Inbound for direction 1", () => {
    expect(formatDirection(1)).toBe("Inbound");
  });

  it("returns em dash for null", () => {
    expect(formatDirection(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatDirection(undefined)).toBe("—");
  });

  it("returns em dash for other values (2, 99)", () => {
    expect(formatDirection(2)).toBe("—");
    expect(formatDirection(99)).toBe("—");
    expect(formatDirection(-1)).toBe("—");
  });
});

describe("formatPickupType", () => {
  it("returns Regular for type 0", () => {
    expect(formatPickupType(0)).toBe("Regular");
  });

  it("returns Not available for type 1", () => {
    expect(formatPickupType(1)).toBe("Not available");
  });

  it("returns Phone agency for type 2", () => {
    expect(formatPickupType(2)).toBe("Phone agency");
  });

  it("returns Coordinate with driver for type 3", () => {
    expect(formatPickupType(3)).toBe("Coordinate with driver");
  });

  it("returns em dash for null", () => {
    expect(formatPickupType(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatPickupType(undefined)).toBe("—");
  });

  it("returns em dash for other values (4, 99)", () => {
    expect(formatPickupType(4)).toBe("—");
    expect(formatPickupType(99)).toBe("—");
    expect(formatPickupType(-1)).toBe("—");
  });
});

describe("formatDropOffType", () => {
  it("uses the same logic as formatPickupType", () => {
    expect(formatDropOffType(0)).toBe(formatPickupType(0));
    expect(formatDropOffType(1)).toBe(formatPickupType(1));
    expect(formatDropOffType(2)).toBe(formatPickupType(2));
    expect(formatDropOffType(3)).toBe(formatPickupType(3));
    expect(formatDropOffType(null)).toBe(formatPickupType(null));
    expect(formatDropOffType(undefined)).toBe(formatPickupType(undefined));
  });
});