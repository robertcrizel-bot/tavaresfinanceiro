/**
 * Pure math shared by the in-app receipt camera preview and its capture
 * pipeline. The Android preview frame is a fixed portrait window (3:4);
 * cameras often deliver a landscape stream, so the visible frame and the
 * captured JPEG must use the SAME center-crop ("cover") rectangle — the
 * photo then matches exactly what the user framed, without stretching
 * either axis.
 */
export const CAMERA_FRAME_ASPECT = 3 / 4;

export interface CoverCropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

/**
 * Center-crop rectangle of `sourceWidth × sourceHeight` that covers a frame
 * with `targetAspect` (width/height). Never upscales or rotates; the larger
 * axis is kept and the surplus is trimmed equally from both sides.
 */
export function coverCropForAspect(
  sourceWidth: number,
  sourceHeight: number,
  targetAspect: number = CAMERA_FRAME_ASPECT,
): CoverCropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetAspect <= 0) {
    return { sx: 0, sy: 0, sWidth: 0, sHeight: 0 };
  }
  const sourceAspect = sourceWidth / sourceHeight;
  let sWidth: number;
  let sHeight: number;
  if (sourceAspect > targetAspect) {
    // Source is wider than the frame: trim the sides.
    sHeight = sourceHeight;
    sWidth = sourceHeight * targetAspect;
  } else {
    // Source is taller (or equal): trim top/bottom.
    sWidth = sourceWidth;
    sHeight = sourceWidth / targetAspect;
  }
  const sx = Math.max(0, Math.round((sourceWidth - sWidth) / 2));
  const sy = Math.max(0, Math.round((sourceHeight - sHeight) / 2));
  return {
    sx,
    sy,
    sWidth: sourceWidth - sx * 2,
    sHeight: sourceHeight - sy * 2,
  };
}
