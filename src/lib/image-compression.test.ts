import { describe, expect, it } from "vitest";
import { calculateImageDimensions } from "@/lib/image-compression";

describe("calculateImageDimensions", () => {
  it("keeps long receipts wide enough for text recognition", () => {
    expect(calculateImageDimensions(1080, 6000, { maxWidth: 1800, maxHeight: 4096 })).toEqual({
      width: 737,
      height: 4096,
    });
  });

  it("uses the available width for a regular camera photo", () => {
    expect(calculateImageDimensions(3000, 4000, { maxWidth: 1800, maxHeight: 4096 })).toEqual({
      width: 1800,
      height: 2400,
    });
  });

  it("preserves the default attachment limit", () => {
    expect(calculateImageDimensions(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });
});
