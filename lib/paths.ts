// GitHub Pages serves this project under a sub-path (e.g. /pacificacio), so any
// runtime-built URL to a static asset or data file must be prefixed with the
// configured base path. next/link and Next's own asset handling already account
// for basePath; this helper is for the paths we build by hand (fetch of the data
// JSON, images loaded into the PDF, the favicon).

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function asset(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${p}`;
}
