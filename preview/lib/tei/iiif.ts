/**
 * IIIF.
 */

/** `…/i3f/v20/4017109/manifest` → `…/i3f/v20`, or null if that is not the shape. */
export function imageRoot(manifest: string | null | undefined): string | null {
  const parts = (manifest ?? '').trim().replace(/\/+$/, '').split('/')
  if (parts.pop() !== 'manifest') return null
  parts.pop() // the manifest's own id
  return /^https?:$/.test(parts[0] ?? '') && parts.length > 2 ? parts.join('/') : null
}

/** IIIF Image API base for one page. */
export const imageBase = (root: string, facs: string): string =>
  `${root}/${encodeURIComponent(facs)}`

/** `info.json` — the descriptor OpenSeadragon needs for deep zoom. */
export const infoUrl = (base: string): string => `${base}/info.json`

/** A scaled JPEG: the panel's baseline, and what it shows if the viewer fails. */
export const imageUrl = (base: string, width = 800): string =>
  `${base}/full/${width},/0/default.jpg`

/**
 * Where the library itself shows a scan, for the link out. e-rara and
 * e-manuscripta run the same software and share the path; anything else gets no
 * link rather than a guessed one.
 */
export function libraryRoot(root: string): string | null {
  const host = /^https?:\/\/[^/]*(?:e-rara|e-manuscripta)\.ch/i.exec(root)
  return host ? `${host[0]}/zuz/content/zoom` : null
}
