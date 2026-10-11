/**
 * The alignments, read as the synopsis page shows them.
 *
 * Input is Alignment JSON 1.0 as `alignment/documents.py` writes it, whether a
 * person corrected the alignment, LERA made it or TextAlign did: witnesses with
 * their tokens, rows with a column per aligned place. The apparatus is derived
 * here, as TextAlign derives it.
 */

import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** A run of words that share a state: invariant, or one side of one variant. */
export interface Reading {
  text: string
  /** The apparatus entry this run belongs to; the same id in every witness. */
  group: string | null
}

/** One place where the witnesses part, as the apparatus records it. */
export interface Entry {
  group: string
  /** Siglum → its reading; a witness that omits reads the empty string. */
  readings: Record<string, string>
  /** The readings are one word in different spellings, not different words. */
  spelling: boolean
  /** How far apart the witnesses are here: 1 to 3, as LERA grades its scale. */
  degree: number
  /** A witness present in the row reads nothing here: an omission, not a substitution. */
  omission: boolean
  /** The sigla that do not read what most of the others read here. */
  departing: string[]
  /** What the other readings are marked against, and what that one is marked against. */
  reference: string
  other: string
  /** How the place is classified, where it is; `by` is set while a rule or a model proposed it unconfirmed. */
  relation?: { type: string, by?: string, model?: string, confidence?: number, rationale?: string }
}

export interface Segment {
  n: number
  /** Siglum → the ids of the source lines its cell holds: `A-l0007`. */
  refs: Record<string, string[]>
  /** LERA marked this segment a heading — where one poem ends and the next begins. */
  head: boolean
  /** Siglum → its reading here. A witness missing from the map has no cell. */
  cells: Record<string, Reading[]>
  /** Sigla LERA says have no text here. */
  missing: string[]
  /** Siglum → the segment its cell repeats. */
  copy: Record<string, number>
  apparatus: Entry[]
  /** The strongest kind of difference in this segment — what the filter reads. */
  varies: 'none' | 'spelling' | 'word'
  /** Siglum → how far it stands from the others here, as the map shades it. */
  departures: Record<string, number>
  /** Which poem of a bundle this segment belongs to: an index into `units`. */
  unit: number
}

/** One poem inside an alignment. A poem aligned on its own is the only unit. */
export interface Unit {
  /** 1-based, as the import file numbers the divisions of a bundle. */
  n: number
  title: string
  /** The segment its heading stands in — where a link to the unit points. */
  start: number
  /** What it holds, which is what the band reports instead of repeating the title. */
  length: number
  variants: number
}

export interface Witness {
  siglum: string
  /** The witness page and poem anchor this column came from; '' when the document does not say. */
  href: string
}

/** Where the alignment came from, as the page reports it under the table. */
export interface Provenance {
  created: string
  updated: string
  algorithm: string
  /** The tool that aligned it, with its version (`meta.aligned_by`); '' for LERA's */
  tool: string
}

/** One set of readings, wherever in the poem the witnesses part that way. */
export interface Group {
  /** The distinct readings, in reading order; an omission reads `''`. */
  forms: string[]
  /** The segments it occurs in, in order. */
  places: number[]
  spelling: boolean
}

/**
 * Every distinct set of readings at a variant place, the most frequent first:
 * `und | vnd ×12`. What separates two editions is mostly a handful of habits
 * repeated, and a register says so in a way a row-by-row apparatus cannot.
 */
function readingGroups(segments: Segment[]): Group[] {
  const groups = new Map<string, Group>()
  for (const segment of segments) {
    for (const entry of segment.apparatus) {
      const forms = [...new Set(Object.values(entry.readings).map((text) => text.trim()))]
      const key = [...forms].sort().join('\u0001')
      const group = groups.get(key) ?? { forms, places: [], spelling: entry.spelling }
      if (group.places.at(-1) !== segment.n) group.places.push(segment.n)
      groups.set(key, group)
    }
  }
  return [...groups.values()].sort((a, b) => b.places.length - a.places.length ||
    a.forms[0].localeCompare(b.forms[0], 'de'))
}

export interface Synopsis {
  /** The poem id, e.g. `n69`. */
  id: string
  title: string
  witnesses: Witness[]
  segments: Segment[]
  /** The poems the alignment holds; one, unless it is a bundle. */
  units: Unit[]
  /** Every distinct set of readings, the most frequent first. */
  groups: Group[]
  /** Apparatus entries over the whole poem. */
  variants: number
  /** Line id → where that line stands among the `l` of the poem in the edition. */
  lines: Record<string, number>
  provenance: Provenance
}

const SPELLINGS = [['ck', 'k'], ['th', 't'], ['dt', 't'], ['tz', 'z'], ['ß', 's'], ['y', 'i'], ['aw', 'au'], ['ew', 'eu']]
const undouble = (text: string): string => text.replace(/(\p{L})\1+/gu, '$1')

/**
 * A reading as TextAlign's rule cascade compares it: two readings with the same
 * form are one word spelt otherwise (`vnd vertrawen`/`und vertrauen`,
 * `zuͦ erligen`/`zuͦerligen`, `Herꝛ`/`Herr`). Inflection survives it — `gelangen`
 * and `gelanget` stay two readings.
 *
 * A copy of `word_form` (`textalign/io/variant_rules.py`), as the preview builds
 * without TextAlign; `test/synopsis.test.ts` holds it to TextAlign's own cases.
 */
export const wordForm = (text: string): string => undouble(SPELLINGS.reduce((t, [a, b]) => t.replaceAll(a, b),
  undouble(text.replaceAll(' ', '').replace(/[^\p{L}\p{N}\p{M}\s]/gu, '').toLowerCase()
    .normalize('NFD').replace(/\p{Mn}/gu, '').replaceAll('ſ', 's').replaceAll('ꝛ', 'r')
    .replaceAll('v', 'u').replaceAll('j', 'i'))))

/**
 * The sigla that stand apart at one place: those not reading, letter for
 * letter, what most of the others read. Where no reading is shared — two
 * witnesses that differ never share one — no witness holds the majority and
 * all of them depart. Spellings count here; whether they are a difference
 * worth showing is `spelling`'s to say.
 */
function departing(readings: Record<string, string>): string[] {
  const values = Object.entries(readings).map(([siglum, text]) => [siglum, text.trim()] as const)
  const counts = new Map<string, number>()
  for (const [, text] of values) counts.set(text, (counts.get(text) ?? 0) + 1)
  const [majority, most] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  return values.filter(([, text]) => most < 2 || text !== majority).map(([siglum]) => siglum)
}

/**
 * How far each witness stands from the rest in one segment, as the map shades
 * it: 0 none, 1 a spelling, 2 one word, 3 several; -1 where it has no text.
 */
function departures(entries: Entry[], sigla: string[], missing: string[]): Record<string, number> {
  return Object.fromEntries(sigla.map((siglum) => {
    if (missing.includes(siglum)) return [siglum, -1]
    const own = entries.filter((e) => e.departing.includes(siglum))
    const words = own.filter((e) => !e.spelling).length
    return [siglum, words > 1 ? 3 : words ? 2 : own.length ? 1 : 0]
  }))
}

/**
 * `a` in parts, each marked whether it differs from `b`: the characters outside
 * a longest common subsequence of the two. What LERA's word view highlights
 * inside a substitution, so that `verdunkelt` against `ver<b>t</b>un<b>c</b>kelt`
 * shows a spelling where `figur` against `gestalt` shows another word.
 *
 * Adapted from `charDiff` in text-alignment's alignment editor
 * (`editor/src/core/compare.ts`). Long readings are left whole: the table is
 * quadratic, and a variant of that size is a rewritten line, not a spelling.
 */
export function charDiff(a: string, b: string): { text: string, differs: boolean }[] {
  const [x, y] = [[...a], [...b]]
  if (!x.length) return []
  if (!y.length || x.length * y.length > 40000) return [{ text: a, differs: true }]

  // lcs[i][j]: the length of the longest common subsequence of x[i:] and y[j:]
  const lcs = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const parts: { text: string, differs: boolean }[] = []
  const push = (char: string, differs: boolean) => {
    const last = parts.at(-1)
    if (last?.differs === differs) last.text += char
    else parts.push({ text: char, differs })
  }
  let j = 0
  for (let i = 0; i < x.length; i++) {
    while (j < y.length && x[i] !== y[j] && lcs[i][j + 1] >= lcs[i][j]) j++
    const kept = j < y.length && x[i] === y[j] && lcs[i][j] === lcs[i + 1][j + 1] + 1
    push(x[i], !kept)
    if (kept) j++
  }
  return parts
}

/**
 * Read one apparatus entry: what differs here, and how much.
 *
 * Only the witnesses that have text in the segment are weighed. LERA's export
 * gives every witness a reading, the empty string for one that is not in the
 * row at all; counting that as a reading would make every place in such a row
 * an omission and a difference of wording.
 */
function entry(raw: any, missing: string[]): Entry {
  const readings: Record<string, string> = raw.readings ?? {}
  const present = Object.fromEntries(
    Object.entries(readings).filter(([siglum]) => !missing.includes(siglum)))
  const values = Object.values(present).map((text) => text.trim())
  const apart = departing(present)
  // Every reading is marked against the one most of them share, and that one
  // against the first reading that differs, so it too shows what is distinctive.
  const reference = Object.entries(present).find(([siglum]) => !apart.includes(siglum))?.[1].trim() ?? values[0] ?? ''
  return {
    group: raw.alignment_id ?? String(raw.number ?? ''),
    readings,
    spelling: new Set(values.map(wordForm)).size === 1,
    // Two readings among four witnesses is a lesser difference than four.
    degree: Math.min(3, Math.max(1, new Set(values).size - 1)),
    departing: apart,
    omission: values.includes(''),
    reference,
    other: values.find((text) => text !== reference) ?? '',
  }
}

/**
 * The strongest difference in a segment.
 *
 * A witness that reads nothing here counts as the strongest: an omission is
 * not an apparatus entry — LERA has no marker to hang one on — but it is the
 * plainest departure there is, and a filter that hid it would hide exactly the
 * places where the editions part company.
 */
const kind = (entries: Entry[], missing: string[]): Segment['varies'] =>
  missing.length || entries.some((e) => !e.spelling) ? 'word'
    : entries.length ? 'spelling' : 'none'

/** What a segment reads, taking the first witness that has text there. */
const text = (segment: Segment): string =>
  Object.values(segment.cells).map((cell) => cell.map((run) => run.text).join(''))
    .find((value) => value.trim())?.trim() ?? ''

/**
 * Divide the segments into the poems they came from, and tell each segment
 * which it belongs to.
 *
 * LERA marks the segments that carry a heading, which is all the division a
 * bundle needs: `n1` is 42 psalms in one alignment, and its 41 headings are
 * where each begins. The import file's `div/@corresp` would seem the better
 * source, but it names the *alignment* — every unit of `n1` carries `#n1` —
 * so the headings are in fact the only thing that distinguishes them.
 *
 * Several heading segments in a row are one heading told by witnesses that
 * divide it differently (`n69` has three), not three poems, so a unit starts
 * where such a run starts. Text before the first heading is a unit of its own.
 */
function divide(segments: Segment[]): Unit[] {
  const units: Unit[] = []
  segments.forEach((segment, i) => {
    if (!units.length || (segment.head && !segments[i - 1]?.head)) {
      units.push({
        n: units.length + 1, title: segment.head ? text(segment) : '', start: segment.n,
        length: 0, variants: 0,
      })
    }
    segment.unit = units.length - 1
    units[segment.unit].length += 1
    units[segment.unit].variants += segment.apparatus.length
  })
  return units
}

/** A witness's `source`, `…/A_1648.xml#n69`, as its page: `A_1648.html#n69`. */
const href = (source = ''): string => encodeURI(source.split('/').pop()!.replace(/\.xml(?=#|$)/, '.html'))

/**
 * Where each imported line stands in the rendered edition: `A-l0007` → the 7th
 * `l` of the poem's division, which is what `build.ts` numbers the lines by.
 *
 * `import.xsl` writes this map because it alone knows what it left out: a
 * line continued with `@next` is one line to LERA and two in the print, and a
 * line inside notated music is not imported at all. Counting on this side would
 * drift — `n69` in A is 128 imported lines against 130 printed ones.
 */
async function lineMap(dir: string, id: string): Promise<Record<string, number>> {
  const lines: Record<string, number> = {}
  let names: string[]
  try {
    names = (await readdir(dir)).filter((name) => name.startsWith(`${id}-`) && name.endsWith('.csv'))
  } catch {
    return lines // no line maps beside the export: the links are simply left out
  }
  for (const name of names) {
    const rows = (await readFile(join(dir, name), 'utf8')).split(/\r?\n/).slice(1)
    for (const row of rows) {
      const [mark, at] = row.split(',')
      if (at) lines[mark] = Number(at)
    }
  }
  return lines
}

/** `2026-09-29T02:10:42.000+02:00` → `29.09.2026`. */
const day = (stamp: string): string => stamp.slice(0, 10).split('-').reverse().join('.')

/**
 * Give every verse line of an aligned poem an id, so a synopsis row can point
 * at the line it came from: the nth rendered `l` of the poem is the nth `<l>`
 * of its division, which is the number `import.xsl` records per line id.
 *
 * A division inside the poem (a bundle's psalms) carries no id of its own and
 * so does not interrupt the count; the next poem does.
 */
export function numberLines(html: string, poems: Set<string>): string {
  let poem = ''
  let n = 0
  return html.replace(/<(?:section|div|p) [^>]*>/g, (tag) => {
    if (tag.startsWith('<section')) {
      const id = / id="([^"]*)"/.exec(tag)
      if (id) [poem, n] = [poems.has(id[1]) ? id[1] : '', 0]
    }
    // The class is a token list, and `tei-lg` must not answer for `tei-l`.
    if (!poem || !/ class="(?:[^"]* )?tei-l[ "]/.test(tag)) return tag
    n += 1
    return tag.replace(/^<([A-Za-z]+)/, `<$1 id="${poem}-l${n}"`)
  })
}

/* ── Alignment JSON ───────────────────────────────────────────────────────────
 *
 * The format both routes converge on (`alignment/workflow.md` §4). It records
 * the alignment itself — witnesses with their tokens, segments with a column
 * per aligned place — and leaves the apparatus to be *derived*, which is what
 * lets an editor's own filters and regularisations decide what counts as a
 * variant. What follows mirrors `textalign/io/alignment_document.py` and the
 * editor's `core/compare.ts`, function for function.
 */

/** What the document's compare filters do to a reading before it is compared. */
function normalize(text: string, filters: string[]): string {
  let out = text.replace(/\s+/g, ' ').trim()
  if (filters.includes('diacritics')) out = out.normalize('NFD').replace(/\p{Mn}/gu, '')
  if (filters.includes('punctuation')) out = out.replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
  if (filters.includes('case')) out = out.toLowerCase()
  if (filters.includes('long-s')) out = out.replaceAll('ſ', 's')
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * The compared form of a reading: normalised, then regularised. A reading a
 * rule's `from` matches reads as its `to`; otherwise each of its words does.
 */
function compared(filters: string[], rules: { from: string, to: string }[]): (text: string) => string {
  const table = new Map(rules.map((r) => [normalize(r.from, filters), normalize(r.to, filters)]))
  return (text) => {
    const form = normalize(text, filters)
    if (!table.size || !form) return form
    return table.get(form) ?? form.split(' ').map((word) => table.get(word) ?? word).join(' ')
  }
}

const span = (tokens: { t: string }[], at?: [number, number]): string =>
  at ? tokens.slice(at[0], at[1]).map((token) => token.t).join('').replace(/\s+/g, ' ').trim() : ''

/** One row of a document, read into the shape the pages render. */
function readSegment(doc: any, raw: any, index: number, sigla: string[],
                  tokens: Record<string, { t: string }[]>, numbers: Map<string, number>): Segment {
  const filters: string[] = doc.settings?.filters ?? []
  const regular = compared(filters, raw.regularizations ?? doc.settings?.regularizations ?? [])
  const present = sigla.filter((siglum) => raw.cells[siglum]?.span)
  const missing = sigla.filter((siglum) => !raw.cells[siglum]?.span)

  // A place is a variant where the present witnesses do not agree once the
  // document's own filters and regularisations have been applied.
  const apparatus: Entry[] = []
  const groupOf = new Map<string, Map<number, string>>(present.map((s) => [s, new Map()]))
  raw.columns.forEach((column: any, c: number) => {
    const readings = Object.fromEntries(present.map((s) =>
      [s, span(tokens[s], column.spans[s])]))
    if (new Set(present.map((s) => regular(readings[s]))).size < 2) return
    const group = `${raw.number ?? index + 1}-${c + 1}`
    apparatus.push({ ...entry({ alignment_id: group, readings }, missing),
      ...(column.relation ? { relation: column.relation } : {}) })
    for (const s of present) {
      const at = column.spans[s]
      if (at) for (let k = at[0]; k < at[1]; k++) groupOf.get(s)!.set(k, group)
    }
  })

  // The cell as runs: neighbouring tokens that say the same thing become one.
  const cells: Record<string, Reading[]> = {}
  for (const siglum of present) {
    const [from, to] = raw.cells[siglum].span
    const runs: Reading[] = []
    for (let k = from; k < to; k++) {
      const group = groupOf.get(siglum)!.get(k) ?? null
      const last = runs.at(-1)
      if (last && last.group === group) last.text += tokens[siglum][k].t
      else runs.push({ text: tokens[siglum][k].t, group })
    }
    cells[siglum] = runs
  }

  const copy: Record<string, number> = {}
  for (const siglum of present) {
    const of = raw.cells[siglum].copy_of
    if (of && numbers.has(of)) copy[siglum] = numbers.get(of)!
  }

  return {
    n: raw.number ?? index + 1,
    refs: raw.refs ?? {},
    head: Object.values(raw.roles ?? {}).includes('head'),
    cells,
    missing,
    copy,
    apparatus,
    varies: kind(apparatus, missing),
    departures: departures(apparatus, sigla, missing),
    unit: 0,
  }
}

/** An alignment document, read as the synopsis pages show it. */
function readDocument(id: string, doc: any, lines: Record<string, number>): Synopsis {
  const sigla: string[] = doc.witnesses.map((w: any) => w.siglum)
  const tokens = Object.fromEntries(doc.witnesses.map((w: any) => [w.siglum, w.tokens]))
  const numbers = new Map<string, number>(
    doc.segments.map((s: any, i: number) => [s.id, s.number ?? i + 1]))
  const segments = doc.segments.map((raw: any, i: number) =>
    readSegment(doc, raw, i, sigla, tokens, numbers))
  const units = divide(segments)
  const by = doc.meta?.aligned_by

  return {
    id,
    title: units[0]?.title || id,
    witnesses: doc.witnesses.map((w: any) => ({ siglum: w.siglum, href: href(w.source) })),
    segments,
    units,
    groups: readingGroups(segments),
    variants: segments.reduce((n: number, s: Segment) => n + s.apparatus.length, 0),
    lines,
    provenance: {
      created: day(doc.meta?.created_at ?? ''),
      updated: day(doc.meta?.updated_at ?? ''),
      algorithm: by ? [by.algorithm, by.normalizer].filter(Boolean).join(', ') : doc.meta?.align_algorithm ?? '',
      tool: by ? `${by.tool === 'textalign' ? 'TextAlign' : by.tool} ${by.version ?? ''}`.trim() : '',
    },
  }
}

/**
 * Every alignment in `dir`, by poem id. A directory that is not there is not an
 * error: the preview is built from the TEI alone until someone aligns a poem.
 */
export async function loadSynopses(dir: string, imports = ''): Promise<Synopsis[]> {
  let names: string[]
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  } catch {
    return []
  }

  const synopses: Synopsis[] = []
  for (const name of names.sort((a, b) => a.localeCompare(b, 'de'))) {
    const data = JSON.parse(await readFile(join(dir, name), 'utf8'))
    // `n69.auto.json` beside `n69.json` is a second alignment of the same poem,
    // kept for comparison; a poem id may itself hold a dot (`n31.a`).
    const id = basename(name, '.json')
    if (id.endsWith('.auto')) continue
    const lines = imports ? await lineMap(imports, id) : {}
    // `documents.py` writes every alignment in this one format; anything else is stale.
    if (data.format !== 'alignment-json') {
      throw new Error(`${name} is not Alignment JSON; regenerate it: python alignment/documents.py`)
    }
    synopses.push(readDocument(id, data, lines))
  }
  return synopses
}
