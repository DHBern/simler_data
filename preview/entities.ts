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

type Row = Record<string, string>
const col = (record: Row, ...names: string[]) => clean(pick(record, ...names))
const authority = (name: string, id: string, href: string): EntityLink[] => (id ? [{ authority: name, id, href }] : [])

/**
 * The registers: each file, and how its columns make a card. This is the sheet's shape,
 * project data the TEI does not hold, so it is not the ODD's to say.
 */
const REGISTERS: { file: string, prefix: string, kind: string, card: (r: Row) => Partial<Entity> }[] = [
  {
    file: 'persons.csv', prefix: 'person', kind: 'Person',
    card: (r) => {
      // The HLS article turns up in the sources column and is worth a real link.
      const hls = col(r, 'Quellen').split(/;\s*/).find((source) => source.includes('hls-dhs-dss.ch'))
      return {
        label: [col(r, 'Familienname'), col(r, 'Vorname')].filter(Boolean).join(', ') || col(r, 'Label'),
        detail: lifespan(pick(r, 'Geburtsdatum'), pick(r, 'Sterbedatum')),
        note: col(r, 'Kurzbeschreibung') || null,
        links: hls ? [{ authority: 'HLS', id: '', href: hls.trim() }] : [],
      }
    },
  },
  {
    file: 'places.csv', prefix: 'place', kind: 'Ort',
    card: (r) => ({
      label: col(r, 'Name') || col(r, 'Label'),
      detail: col(r, 'Namensvariante') ? `auch: ${col(r, 'Namensvariante')}` : null,
      links: authority('GeoNames', col(r, 'GeoNames'), `https://www.geonames.org/${col(r, 'GeoNames')}`),
    }),
  },
  {
    file: 'works.csv', prefix: 'work', kind: 'Werk',
    card: (r) => ({
      label: col(r, 'Titel') || col(r, 'Label'),
      detail: [col(r, 'Person'), [col(r, 'Ort'), col(r, 'Jahr')].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || null,
      note: col(r, 'Verlag') ? `Verlag: ${col(r, 'Verlag')}` : null,
    }),
  },
  {
    file: 'institutions.csv', prefix: 'institution', kind: 'Institution',
    card: (r) => ({ label: col(r, 'Name') || col(r, 'Label'), detail: col(r, 'Bemerkungen') || null }),
  },
]

function entityOf(register: (typeof REGISTERS)[number], record: Row): Entity | null {
  const { label = '', detail = null, note = null, links = [] } = register.card(record)
  const gnd = authority('GND', col(record, 'GND'), `https://d-nb.info/gnd/${col(record, 'GND')}`)
  return label ? { kind: register.kind, label, detail, note, links: [...gnd, ...links] } : null
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

  for (const register of REGISTERS) {
    const { file, kind } = register
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
      const entity = id ? entityOf(register, record) : null
      if (id && entity) entities[id] = entity
    }
  }

  return entities
}
