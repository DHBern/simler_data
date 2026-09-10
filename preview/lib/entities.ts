/**
 * The entity registers, from the project's Google Sheet.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface EntityLink {
  authority: string
  id: string
  href: string
}

/** One entry, in the shape the card shows. */
export interface Entity {
  /** `Person`, `Ort`, `Werk`, `Institution` — what the card is a card of. */
  kind: string
  label: string
  /** One line under the name: dates, a name variant, author and year. */
  detail: string | null
  note: string | null
  links: EntityLink[]
}

const REGISTERS = [
  { file: 'persons.csv', prefix: 'person', kind: 'Person' },
  { file: 'places.csv', prefix: 'place', kind: 'Ort' },
  { file: 'works.csv', prefix: 'work', kind: 'Werk' },
  { file: 'institutions.csv', prefix: 'institution', kind: 'Institution' },
] as const

/** RFC 4180: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch !== '"') field += ch
      else if (text[i + 1] === '"') (field += '"'), i++
      else quoted = false
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === ',') (row.push(field), (field = ''))
    else if (ch === '\n') (row.push(field), rows.push(row), (row = []), (field = ''))
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row))
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

const clean = (value: string | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()

/** The sheet's column names are German and occasionally decorated; match loosely. */
function pick(record: Record<string, string>, ...candidates: string[]): string {
  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(record)) {
      if (key.toLowerCase().startsWith(candidate.toLowerCase()) && value) return value
    }
  }
  return ''
}

function lifespan(birth: string, death: string): string | null {
  const [b, d] = [clean(birth), clean(death)]
  return b || d ? `${b || '?'}–${d || '?'}` : null
}

function entityOf(prefix: string, kind: string, record: Record<string, string>): Entity | null {
  const links: EntityLink[] = []
  const gnd = clean(pick(record, 'GND'))
  if (gnd) links.push({ authority: 'GND', id: gnd, href: `https://d-nb.info/gnd/${gnd}` })

  let label = ''
  let detail: string | null = null
  let note: string | null = null

  if (prefix === 'person') {
    const name = [clean(pick(record, 'Familienname')), clean(pick(record, 'Vorname'))]
      .filter(Boolean)
      .join(', ')
    label = name || clean(pick(record, 'Label'))
    detail = lifespan(pick(record, 'Geburtsdatum'), pick(record, 'Sterbedatum'))
    note = clean(pick(record, 'Kurzbeschreibung')) || null
    // The HLS article turns up in the sources column and is worth a real link.
    const hls = clean(pick(record, 'Quellen'))
      .split(/;\s*/)
      .find((source) => source.includes('hls-dhs-dss.ch'))
    if (hls) links.push({ authority: 'HLS', id: '', href: hls.trim() })
  } else if (prefix === 'place') {
    label = clean(pick(record, 'Name')) || clean(pick(record, 'Label'))
    const variant = clean(pick(record, 'Namensvariante'))
    detail = variant ? `auch: ${variant}` : null
    const geonames = clean(pick(record, 'GeoNames'))
    if (geonames) {
      links.push({ authority: 'GeoNames', id: geonames, href: `https://www.geonames.org/${geonames}` })
    }
  } else if (prefix === 'work') {
    label = clean(pick(record, 'Titel')) || clean(pick(record, 'Label'))
    const where = [clean(pick(record, 'Ort')), clean(pick(record, 'Jahr'))].filter(Boolean).join(' ')
    detail = [clean(pick(record, 'Person')), where].filter(Boolean).join(' · ') || null
    const publisher = clean(pick(record, 'Verlag'))
    note = publisher ? `Verlag: ${publisher}` : null
  } else {
    label = clean(pick(record, 'Name')) || clean(pick(record, 'Label'))
    detail = clean(pick(record, 'Bemerkungen')) || null
  }

  return label ? { kind, label, detail, note, links } : null
}

/**
 * Every entity the sheet knows, keyed by `rs/@key`.
 *
 * A missing CSV is not an error: the tooltips are then simply absent and
 * `build.ts` says so once, rather than failing a corpus render over a file that
 * belongs to another workflow.
 */
export async function loadEntities(dir: string): Promise<Record<string, Entity>> {
  const entities: Record<string, Entity> = {}

  for (const { file, prefix, kind } of REGISTERS) {
    let text: string
    try {
      text = await readFile(join(dir, file), 'utf8')
    } catch {
      continue
    }
    const [header, ...body] = parseCsv(text)
    if (!header) continue
    const keys = header.map((h) => h.trim())

    for (const cells of body) {
      const record: Record<string, string> = {}
      keys.forEach((key, i) => (record[key] = (cells[i] ?? '').trim()))
      const id = pick(record, `${kind}-ID`, 'Werk-ID', 'Ort-ID', 'ID')
      const entity = id ? entityOf(prefix, kind, record) : null
      if (id && entity) entities[id] = entity
    }
  }

  return entities
}
