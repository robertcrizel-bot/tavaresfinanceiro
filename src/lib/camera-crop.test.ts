import { describe, it, expect } from "vitest";
import { CAMERA_FRAME_ASPECT, coverCropForAspect } from "@/lib/camera-crop";

describe("CAMERA_FRAME_ASPECT", () => {
  it("is the portrait 3:4 width/height ratio", () => {
    expect(CAMERA_FRAME_ASPECT).toBeCloseTo(0.75, 10);
  });
});

describe("coverCropForAspect", () => {
  it("trims the sides of a landscape source to cover a portrait frame", () => {
    const rect = coverCropForAspect(3840, 2160);
    expect(rect).toEqual({ sx: 1110, sy: 0, sWidth: 1620, sHeight: 2160 });
  });

  it("trims top/bottom of a portrait source taller than the frame", () => {
    const rect = coverCropForAspect(2160, 3840);
    expect(rect).toEqual({ sx: 0, sy: 480, sWidth: 2160, sHeight: 2880 });
  });

  it("keeps the full source when it already matches the frame ratio", () => {
    const rect = coverCropForAspect(1200, 1600);
    expect(rect).toEqual({ sx: 0, sy: 0, sWidth: 1200, sHeight: 1600 });
  });

  it("keeps crop rectangles exactly on the target aspect", () => {
    for (const [w, h] of [[3840, 2160], [2160, 3840], [1280, 960], [800, 800], [1000, 500]] as const) {
      const rect = coverCropForAspect(w, h);
      expect(rect.sWidth / rect.sHeight).toBeCloseTo(CAMERA_FRAME_ASPECT, 2);
      expect(rect.sx + rect.sWidth + rect.sx).toBeLessThanOrEqual(w + 1);
      expect(rect.sy + rect.sHeight + rect.sy).toBeLessThanOrEqual(h + 1);
    }
  });

  it("returns an empty rect for invalid dimensions instead of NaN", () => {
    expect(coverCropForAspect(0, 100)).toEqual({ sx: 0, sy: 0, sWidth: 0, sHeight: 0 });
    expect(coverCropForAspect(100, 0)).toEqual({ sx: 0, sy: 0, sWidth: 0, sHeight: 0 });
    expect(coverCropForAspect(-1, -1)).toEqual({ sx: 0, sy: 0, sWidth: 0, sHeight: 0 });
  });
});
