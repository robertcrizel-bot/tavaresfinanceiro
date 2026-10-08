/**
 * Identificador inequívoco do bundle em execução.
 * Injetado em build time via `define` no vite.config.ts (git rev-parse --short HEAD).
 */
export const BUILD_COMMIT: string =
  typeof __BUILD_COMMIT__ === "string" && __BUILD_COMMIT__.length > 0
    ? __BUILD_COMMIT__
    : "desconhecido";

export const BUILD_TIME: string =
  typeof __BUILD_TIME__ === "string" && __BUILD_TIME__.length > 0
    ? __BUILD_TIME__
    : "desconhecido";

export function buildStamp(): string {
  return `${BUILD_COMMIT} | ${BUILD_TIME}`;
}
