import { useState } from "react";

type FinVisionBrandIconProps = {
  size?: "sm" | "md";
};

/** Reuse the same FinVision symbol already shipped as the app icon. */
export function FinVisionBrandIcon({ size = "md" }: FinVisionBrandIconProps) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <span className={`flex ${dimensions} shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground`}>
      {failed ? (
        <span aria-label="FinVision">F</span>
      ) : (
        <img
          src="/finvision-icon.svg"
          alt="Logo FinVision"
          className="h-full w-full object-contain"
          width={size === "sm" ? 32 : 36}
          height={size === "sm" ? 32 : 36}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
