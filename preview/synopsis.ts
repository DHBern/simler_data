/**
 * The synopsis pages: a poem as its witnesses read it side by side.
 *
 * Kept apart from `page.ts`, which renders the TEI the ODD describes. This
 * knows nothing about the ODD, and the reading pages load none of its assets.
 */

import { CATEGORIES, charDiff, SETTINGS, type Category, type Entry, type Group, type Segment, type Step, type Synopsis, type Unit, type Witness } from './alignments'
import { corpusPage, esc } from './page'

/** Where a poem's synopsis lives; the pages sit flat beside the documents. */
export const synopsisHref = (id: string): string => `synopse-${encodeURIComponent(id)}.html`

/** The categories as the reader sees them: a name, and what it holds. */
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c, [SETTINGS.categories[c].label, SETTINGS.categories[c].title]])) as Record<Category, [string, string]>
/** What *sachlich* leaves out. */
/**
 * A colour per category, from `categories.json` (Tableau 10, chosen by meaning):
 * the marks, the chips, the mix bars. `--hue` is an `r g b` triplet, as the tokens are.
 */
const PALETTE = `<style>${CATEGORIES.map((c) => {
  const hex = SETTINGS.categories[c].colour
  return `[data-cat="${c}"]{--hue:${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')}}`
}).join('')}</style>`

/** The witnesses shown first: the default ones, unless that left nothing to compare. */
const firstShown = (sigla: string[]): string[] => {
  const own = sigla.filter((s) => SETTINGS.witnesses.includes(s))
  return own.length > 1 ? own : sigla
}
/** What the counts count: the places, and each row a witness has no text in. */
const counted = (segments: Segment[]): { category: Category }[] =>
  segments.flatMap((s) => [...s.apparatus, ...(s.line ? [{ category: s.line }] : [])])

/** The relation types, as the apparatus names them. */
const TYPE_LABELS: Record<string, string> = {
  punctuation: 'Interpunktion', orthographic: 'Orthographie', spelling: 'Schreibung', grammatical: 'Grammatik',
  lexical: 'Wortlaut', transposition: 'Umstellung', repetition: 'Wiederholung', uncertain: 'unsicher', other: 'sonstige',
}

/** The cascade's steps as *Vergleich ohne* offers them, in reading order: a name, and what it leaves out. */
const STEP_LABELS: Record<Step, [string, string]> = {
  punctuation: ['Interpunktion', 'Virgel, Komma, Punkt …, auch gegen nichts'],
  case: ['Groß/klein', 'Wer / wer'],
  diacritics: ['Diakritika', 'aͤ / ä, uͦ / u'],
  'nasal stroke': ['Nasalstrich', 'meldẽ / melden, uñ / und'],
  'long s, r rotunda': ['ſ/ꝛ', 'ſein / sein, Herꝛ / Herr'],
  'u/v, i/j': ['u/v, i/j', 'vnd / und, jhn / ihn'],
  'doubled letters': ['Doppelbuchstaben', 'auff / auf'],
  'spelling variants': ['Schreibvarianten', 'ck/k, th/t, dt/t, tz/z, ß/s, y/i, aw/au, d/t, bt/pt, Dehnungs-h, -eren/-ern'],
  'word division': ['Getrenntschreibung', 'Gottes ſohn / Gottesſohn'],
}
/** The category a step settles a place in: the type its rule gives, as `categories.json` files it. */
const stepCategory = (s: Step) => (SETTINGS.types as Record<string, Category>)[s === 'punctuation' ? 'punctuation' : 'orthographic']

/**
 * Where each poem of a bundle begins. It is the one thing the filter cannot
 * take away: with the segments that do not differ hidden, this is what says
 * which psalm a row belongs to.
 */
function unitList(units: Unit[]): string {
  if (units.length < 2) return ''
  const link = (unit: Unit) =>
    `<a href="#seg-${unit.start}" title="${esc(unit.title)}"><b>${unit.n}</b> ${esc(unit.title)}</a>`
  return `<nav class="syn-units no-print" aria-label="Gedichte">${units.map(link).join('')}</nav>`
}

/**
 * How the marks are coloured, and what each shade means: one table for the
 * select and the legend. The legend's swatches are the same elements the table
 * uses, with the same attributes, so the stylesheet colours both from one rule
 * and the legend cannot come to say something the page does not do.
 */
function colours(witnesses: Witness[]): Record<string, { label: string, keys: [string, string][] }> {
  return {
    type: {
      label: 'Typ',
      keys: [], // the chips are its legend
    },
    variance: {
      label: 'Varianz',
      keys: [['data-degree="1"', 'zwei Lesarten'], ['data-degree="2"', 'drei'], ['data-degree="3"', 'vier oder mehr']],
    },
    change: {
      label: 'Art der Änderung',
      keys: [['data-change="sub"', 'andere Lesart'], ['data-change="om"', 'fehlt bei einem Textzeugen']],
    },
    ...Object.fromEntries(witnesses.map((w, i) => [`w${i + 1}`, {
      label: `gegen ${w.siglum}`,
      keys: [['data-alike=""', `weicht von ${w.siglum} ab`]] as [string, string][],
    }])),
  }
}

/** A legend entry: a word marked as the table marks it, and what that means. */
const swatch = (attrs: string, label: string) =>
  `<span class="syn-swatch"><span class="var" ${attrs}><b>Aa</b></span> ${esc(label)}</span>`

/**
 * The reading options above a synopsis, and the legend under them.
 *
 * What to show is chosen by category, each with its count, and by the compare
 * filters to add to the document's; the script hides and counts. Every other
 * control sets one attribute and the stylesheet does the rest. With no script
 * the page shows everything, coloured by type.
 */
function synopsisControls(synopsis: Synopsis): string {
  const { witnesses, units, segments, doubtful, proposed } = synopsis
  const counts = tally(counted(segments))
  const shown = firstShown(witnesses.map((w) => w.siglum))
  const modes = colours(witnesses)
  const machine = segments.some((s) => s.apparatus.some((e) => e.relation?.by === 'model'))

  const chip = (c: Category) => `<label class="syn-chip" data-cat="${c}" title="${esc(CATEGORY_LABELS[c][1])}" data-n="${counts.get(c) ?? 0}">` +
    `<input type="checkbox" data-syn-cat="${c}"${SETTINGS.shown.includes(c) ? ' checked' : ''}> ${CATEGORY_LABELS[c][0]} <span class="n">${counts.get(c) ?? 0}</span></label>`
  const filter = ([step, [label, title]]: [string, [string, string]]) =>
    `<label class="ctrl" title="${esc(title)}"><input type="checkbox" data-syn-ignore="${esc(step)}" checked> ${esc(label)}</label>`
  // The steps under the category they settle, in its colour; the script dims a group whose category is not shown.
  const steps = [...new Set((Object.keys(STEP_LABELS) as Step[]).map(stepCategory))].map((c) => `<span class="syn-steps" data-cat="${c}" data-syn-steps>` +
    `<span class="syn-steps-of">${CATEGORY_LABELS[c][0]}:</span> ` +
    `${Object.entries(STEP_LABELS).filter(([s]) => stepCategory(s as Step) === c).map(filter).join('')}</span>`).join('')
  const witness = (w: Witness, i: number) =>
    `<label><input type="checkbox" data-syn-witness="${i + 1}"${shown.includes(w.siglum) ? ' checked' : ''}> ${esc(w.siglum)}</label>`

  // The boxes of their row: all, as on first opening, or none.
  const presets = '<span class="syn-presets"><button type="button" data-syn-preset="all">alle</button>' +
    '<button type="button" data-syn-preset="default" title="Wie beim ersten Öffnen">Voreinstellung</button>' +
    '<button type="button" data-syn-preset="none">keine</button></span>'

  // On a narrow screen the strips stand above, and the controls fold into *Ansicht*.
  return `<form class="syn-bar no-print" data-syn-controls>
      <div class="syn-glance">${stripsOf(synopsis)}</div>
      <details class="syn-view" open data-syn-view>
      <summary>Ansicht</summary>
      <div class="syn-row">
        <span class="syn-label">Zeigen</span>
        ${CATEGORIES.map(chip).join('')}
        ${presets}
      </div>
      <div class="syn-row">
        <span class="ctrl syn-witnesses"><span class="syn-label">Textzeugen</span> ${witnesses.map(witness).join('')}</span>
        <label class="ctrl" title="n und p springen zur nächsten Abweichung"><input type="checkbox" data-syn="varying"> nur Abweichungen
          <output class="syn-count" data-syn-count></output></label>
      </div>
      <div class="syn-options">
        <div class="syn-row" title="Was beim Vergleich nicht als Unterschied zählt: die Stufen der Schreibregeln. Sie betreffen nur Stellen der Kategorie darüber, die eine Regel oder eine Person so bestimmt hat; Vorschläge des Modells bleiben.">
          <span class="syn-label">Gleich trotz</span>
          ${steps}
          ${presets}
        </div>
        <div class="syn-row">
          <label class="ctrl"><span class="syn-label">Färben nach</span>
            <select data-syn="colour">${Object.entries(modes).map(([mode, { label }]) =>
              `<option value="${mode}">${esc(label)}</option>`).join('')}</select>
          </label>
          <label class="ctrl"><input type="checkbox" data-syn="apparatus"> Apparat</label>
          ${machine ? '<label class="ctrl" title="Typen, die ein Sprachmodell vorgeschlagen und noch niemand bestätigt hat; ' +
            'ohne sie zählen diese Stellen als offen"><input type="checkbox" data-syn-model checked> Modellvorschläge</label>' : ''}
          ${units.length > 1 ? '<label class="ctrl" title="Wo im Band ein Gedicht anfängt, und was es enthält">' +
            '<input type="checkbox" data-syn="units"> Gedichte</label>' : ''}
        </div>
        <p class="syn-legend">
          ${Object.entries(modes).map(([mode, { keys }]) =>
            `<span class="syn-keys" data-for="${mode}">${keys.map(([attrs, label]) => swatch(attrs, label)).join('')}</span>`).join('')}
          ${swatch('data-state="confirmed"', 'Typ bestätigt')}${swatch('data-state="proposed"', 'von Regel oder Modell vorgeschlagen')}${swatch('data-state="open"', 'offen')}
          <span class="syn-swatch"><span class="gap-key"></span> kein Text</span>
          <span class="syn-swatch"><span class="copy">grau</span> wiederholt ein früheres Segment</span>
          <span class="syn-swatch"><span class="line-link">↗</span> zur Zeile in der Ausgabe</span>
          ${doubtful ? '<span class="syn-swatch"><span class="doubt">?</span> Ausrichtung zweifelhaft</span>' : ''}
          ${proposed ? '<span class="syn-swatch"><span class="pairing">⇄</span> andere Zeilenpaarung vorgeschlagen</span>' : ''}
          <span class="syn-swatch">Streifen rechts (schmal: oben), einer je Textzeuge: Lücke = Zeilen fehlen, Spalt = neue Strophe, dunkler = stärkere Abweichung, <span class="syn-moved-key"></span> wohl verschoben</span>
        </p>
      </div>
      </details>
    </form>`
}

/**
 * Every distinct set of readings in the poem, the most frequent first.
 *
 * Read row by row, an apparatus says nothing about habit; read this way, it
 * says that `vnd`/`und` is one decision taken forty times and that the readings
 * occurring once are where the interesting variants are.
 */
function readingRegister(groups: Group[]): string {
  if (!groups.length) return ''
  const places = groups.reduce((n, group) => n + group.places.length, 0)
  // Without the model's types its sets are open again: that fold must be there to take them.
  const machine = groups.some((g) => g.by === 'model')
  const sections = CATEGORIES.map((c) => [c, groups.filter((g) => g.category === c)] as const)
    .filter(([c, gs]) => gs.length || (c === 'open' && machine))
  const item = (group: Group) => {
    const forms = group.forms.map((form) =>
      form ? `<b>${esc(form)}</b>` : '<i>fehlt</i>').join(' <span class="sep">|</span> ')
    const where = group.places.slice(0, 12).map((n) =>
      `<a href="#seg-${n}">${n}</a>`).join(' ')
    return `<li data-cat="${group.category}"${group.step ? ` data-step="${group.step}"` : ''}${group.by === 'model' ? ' data-by="model"' : ''} data-n="${group.places.length}">${forms}
        <span class="count">×${group.places.length}</span>
        <span class="places">${where}${group.places.length > 12 ? ' …' : ''}</span>
      </li>`
  }
  return `<details class="syn-register">
      <summary>Lesarten: ${groups.length} verschiedene an ${places} Stellen</summary>
      ${sections.map(([c, gs]) => `<details class="syn-cat" data-cat="${c}" open>
        <summary>${CATEGORY_LABELS[c][0]} <span class="count">${gs.length}</span></summary>
        <ol>${gs.map(item).join('')}</ol>
      </details>`).join('')}
    </details>`
}

/** Places per category. */
function tally(entries: { category: Category }[]): Map<Category, number> {
  const counts = new Map<Category, number>()
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  return counts
}

/** A poem's variants as one bar split by category, in the type colours. */
function mixBar(counts: Map<Category, number>): string {
  const part = (c: Category) => {
    const n = counts.get(c)
    return n ? `<i data-cat="${c}" style="flex-grow:${n}" title="${esc(`${CATEGORY_LABELS[c][0]} ${n}`)}"></i>` : ''
  }
  return counts.size ? `<span class="syn-mix">${CATEGORIES.map(part).join('')}</span>` : ''
}

/**
 * Witness against witness: at how many places two read otherwise, which edition
 * stands closest to which. It counts what the page shows: built with the
 * categories shown first and no rule's place, then the script recounts it as
 * the reader chooses. Two witnesses need no table: that is the poem's count.
 */
function pairMatrix(witnesses: Witness[], segments: Segment[]): string {
  if (witnesses.length < 3) return ''
  const column = new Map(witnesses.map((w, i) => [w.siglum, i + 1]))
  const places = segments.flatMap((s) => [
    ...(s.line ? [{ category: s.line, pairs: linePairs(s, column) }] : []),
    ...s.apparatus.map((e) => ({ ...e, pairs: apartPairs(e, column) }))])
  const shown = (p: (typeof places)[number]) => (SETTINGS.shown as string[]).includes(p.category) && !('step' in p && p.step)
  const counts = witnesses.map((_, i) => witnesses.map((_, j) =>
    places.filter((p) => shown(p) && p.pairs.includes(`${Math.min(i, j) + 1}-${Math.max(i, j) + 1}`)).length))
  const most = Math.max(1, ...counts.flat())
  const cell = (i: number, j: number) => i === j ? '<td></td>'
    : `<td data-pair="${Math.min(i, j) + 1}-${Math.max(i, j) + 1}" style="--k:${(counts[i][j] / most).toFixed(2)}"` +
      ` title="${esc(`${witnesses[i].siglum} gegen ${witnesses[j].siglum}: ${counts[i][j]} Stellen`)}">${counts[i][j]}</td>`
  return `<details class="syn-pairs" data-syn-pairs>
      <summary>Textzeugen paarweise: wie oft sie abweichen, nach dem, was oben gewählt ist</summary>
      <table>
        <tr><th></th>${witnesses.map((w) => `<th>${esc(w.siglum)}</th>`).join('')}</tr>
        ${witnesses.map((a, i) => `<tr><th>${esc(a.siglum)}</th>${witnesses.map((_, j) => cell(i, j)).join('')}</tr>`).join('')}
      </table>
    </details>`
}

/** The pairs of columns (`1-3`) that read otherwise at a place. */
const apartPairs = (e: Entry, column: Map<string, number>): string[] => {
  const sigla = Object.keys(e.readings)
  return sigla.flatMap((a, i) => sigla.slice(i + 1).filter((b) => !e.alike[a].includes(b))
    .map((b) => [column.get(a)!, column.get(b)!].sort((x, y) => x - y).join('-')))
}
/** And for a whole line: each witness without it against each with it. */
const linePairs = (s: Segment, column: Map<string, number>): string[] =>
  s.missing.flatMap((a) => Object.keys(s.cells).map((b) => [column.get(a)!, column.get(b)!].sort((x, y) => x - y).join('-')))

/** At most this many cells of a strip: what 10rem can still tell apart, and upright, what a screen's height can. */
const STACK_BINS = 120
const MAP_BINS = 400

/**
 * A poem's rows as one strip per print, on one axis: what a print lacks is a
 * hole, a stanza it lacks a long hole, against the other strips. A cell is as
 * dark as its print departs most in that bin (0 same, 1 a spelling, 2 a word,
 * 3 several), a thin gap starts a stanza, and a line that seems moved has a
 * colour of its own and says where to. Like cells run together. Upright, the
 * strips make the synopsis' minimap; an SVG per print, so each can be hidden.
 */
function stack({ witnesses, segments, stanzas }: Synopsis, upright = false): string[] {
  const bins = Math.min(upright ? MAP_BINS : STACK_BINS, segments.length)
  // In viewBox units, which stretch to the strip: about a pixel.
  const px = bins / (upright ? 600 : 160)
  const bin = (i: number) => segments.slice(Math.floor(i * segments.length / bins), Math.floor((i + 1) * segments.length / bins))
  return witnesses.map(({ siglum }) => {
    let stanza: number | undefined
    const runs: { from: number, to: number, cls: string, said?: string }[] = []
    for (let i = 0; i < bins; i++) {
      const part = bin(i)
      const level = Math.max(...part.map((s) => s.departures[siglum]))
      if (level < 0) continue
      const moved = part.find((s) => siglum in s.moved)
      const here = part.flatMap((s) => s.refs[siglum] ?? []).map((ref) => stanzas[ref]).find(Boolean)
      const opens = here !== undefined && stanza !== undefined && here !== stanza
      if (here !== undefined) stanza = here
      const cls = moved ? 'moved' : `l${level}`
      const last = runs.at(-1)
      if (!moved && !opens && last?.cls === cls && last.to === i) last.to = i + 1
      else runs.push({ from: i + (opens ? 1.5 * px : 0), to: i + 1, cls,
        said: moved && `Segment ${moved.n}: steht wohl anders, vgl. Segment ${moved.moved[siglum]}` })
    }
    const rect = ({ from, to, cls, said }: (typeof runs)[number]) => {
      const [at, size] = [from.toFixed(3), Math.max(0.05, to - from - px / 4).toFixed(3)]
      return `<rect ${upright ? `x="0" y="${at}" width="1" height="${size}"` : `x="${at}" y="0" width="${size}" height="1"`} class="${cls}">` +
        `${said ? `<title>${esc(said)}</title>` : ''}</rect>`
    }
    const has = segments.filter((s) => s.departures[siglum] >= 0).length
    return `<svg viewBox="0 0 ${upright ? `1 ${bins}` : `${bins} 1`}" preserveAspectRatio="none" role="img" ` +
      `aria-label="${esc(`${siglum}: ${has} von ${segments.length} Segmenten`)}">${runs.map(rect).join('')}</svg>`
  })
}

/** The strips stacked, as the overview shows them; on a synopsis, each with its siglum. */
function stripsOf(synopsis: Synopsis, sigla = true): string {
  return `<span class="syn-stack">${stack(synopsis).map((svg, i) => sigla
    ? `<span class="syn-strip" data-w="${i + 1}"><b>${esc(synopsis.witnesses[i].siglum)}</b>${svg}</span>`
    : `<span class="syn-strip">${svg}</span>`).join('')}</span>`
}

/**
 * The strips upright beside the table, as an editor's minimap: in view while
 * reading, with a frame over the rows on screen; the script shows it, moves the
 * frame and turns a click or a drag into a jump.
 */
function minimap(synopsis: Synopsis): string {
  const at = (html: string, i: number) => html.replace(/^<(\w+)/, `<$1 data-w="${i + 1}"`)
  return `<aside class="syn-aside no-print" hidden data-syn-map>
      <nav class="syn-minimap" aria-label="Übersicht: wo Zeilen fehlen und wo abgewichen wird">
        <span class="syn-map-heads">${synopsis.witnesses.map((w, i) => at(`<b>${esc(w.siglum)}</b>`, i)).join('')}</span>
        <span class="syn-map" title="Klicken oder ziehen: zu dieser Stelle">${stack(synopsis, true).map(at).join('')}<i class="syn-frame"></i></span>
      </nav>
    </aside>`
}

/**
 * Every reading set of the corpus, by category as in a poem's register, the
 * most frequent first: the printers' habits (`vnd | und`) on top, the readings
 * found once, where the interesting variants are, below; each with its poems.
 */
function corpusRegister(synopses: Synopsis[]): string {
  const sets = new Map<string, { forms: string[], category: Category, places: number, poems: [string, number][] }>()
  for (const s of synopses) {
    for (const g of s.groups) {
      const key = `${g.category}${[...g.forms].sort().join('')}`
      const set = sets.get(key) ?? { forms: g.forms, category: g.category, places: 0, poems: [] }
      set.places += g.places.length
      set.poems.push([s.id, g.places[0]])
      sets.set(key, set)
    }
  }
  if (!sets.size) return ''
  const all = [...sets.values()].sort((a, b) => b.places - a.places || b.poems.length - a.poems.length)
  const count = (list: typeof all) => list.reduce((n, s) => n + s.places, 0)
  // On one line each: there are thousands.
  const item = (s: (typeof all)[number]) => `<li>${s.forms.map((f) => f ? `<b>${esc(f)}</b>` : '<i>fehlt</i>').join(' <span class="sep">|</span> ')}` +
    ` <span class="count">×${s.places}${s.poems.length > 1 ? ` in ${s.poems.length} Gedichten` : ''}</span>` +
    ` <span class="places">${s.poems.slice(0, 8).map(([id, n]) => `<a href="${esc(synopsisHref(id))}#seg-${n}">${esc(id)}</a>`).join(' ')}${s.poems.length > 8 ? ' …' : ''}</span></li>`
  const sections = CATEGORIES.map((c) => [c, all.filter((s) => s.category === c)] as const).filter(([, list]) => list.length)
  return `<details class="syn-register">
      <summary>Lesarten: ${all.length} verschiedene an ${count(all)} Stellen, nach Kategorie, die häufigsten zuerst</summary>
      ${sections.map(([c, list]) => `<details class="syn-cat" data-cat="${c}">
        <summary>${CATEGORY_LABELS[c][0]} <span class="count">${list.length} verschiedene an ${count(list)} Stellen</span></summary>
        <ol>${list.map(item).join('')}</ol>
      </details>`).join('')}
    </details>`
}

/**
 * How a place is classified. What a rule or a model proposed and nobody has
 * confirmed says so, and is never shown as the edition's judgement.
 */
function relationLabel(r: NonNullable<Entry['relation']>): string {
  const sure = r.confidence === undefined ? '' : ` ${Math.round(r.confidence * 100)} %`
  const who = r.by === 'model' ? `Modell${sure}` : r.by === 'rule' ? 'Regel' : ''
  const title = [who && `${who}, nicht bestätigt`, r.rule, r.model, r.rationale].filter(Boolean).join(' · ')
  return `<span class="app-rel"${r.by ? ` data-by="${esc(r.by)}"` : ''}${title ? ` title="${esc(title)}"` : ''}>` +
    `${esc(TYPE_LABELS[r.type] ?? r.type)}${who ? ` <small>${esc(who)}</small>` : ''}</span>`
}

/**
 * A reading with the characters marked that differ from what the other
 * witnesses read. Two readings that share almost nothing are marked whole:
 * the letters `glaube` happens to share with `nimmermehr` are not a spelling,
 * and marking them scatters the word for no reason.
 */
function marked(text: string, entry?: Entry): string {
  if (!entry) return esc(text)
  const parts = charDiff(text, text.trim() === entry.reference ? entry.other : entry.reference)
  const shared = parts.filter((part) => !part.differs).reduce((n, part) => n + part.text.length, 0)
  if (shared * 3 < text.length) return `<b>${esc(text)}</b>`
  return parts.map(({ text: part, differs }) => differs ? `<b>${esc(part)}</b>` : esc(part)).join('')
}

/**
 * One place as a printed apparatus gives it: the lemma — the reading of the
 * earliest print in the row, since the document lists the witnesses in the
 * prints' order — then each reading that departs from it, with its sigla:
 * `vertrawe A ] vertraue B C; glaube nicht F42A`.
 */
function lemmatised(e: Entry): string {
  const forms = new Map<string, string[]>()
  for (const [siglum, text] of Object.entries(e.readings)) {
    forms.set(text.trim(), [...(forms.get(text.trim()) ?? []), siglum])
  }
  const reading = ([form, sigla]: [string, string[]], lemma = false) =>
    `<span class="rdg${lemma ? ' lem' : ''}">${form ? esc(form) : '<em>fehlt</em>'} <i>${sigla.map(esc).join(' ')}</i></span>`
  const [lemma, ...rest] = forms
  return `${reading(lemma, true)} <span class="sep">]</span> ${rest.map((r) => reading(r)).join('<span class="sep">;</span> ')}`
}

/** The source line ids a row holds, all witnesses', for its number's title. */
const marks = (segment: Segment): string => Object.values(segment.refs).flat().join(', ')

/** Who aligned a poem, as a tag: the same on the page and in the overview. */
const basisTag = ({ basis }: Synopsis['provenance']) =>
  `<b class="basis" data-basis="${basis === 'LERA' ? 'lera' : 'textalign'}">${basis}</b>`

/**
 * The page in one line, before anything else: what a reader acts on, and
 * whether a person has checked it — a machine's work looks no different from a
 * person's, so this is what tells them apart. Who aligned it stands at the foot.
 */
function summaryLine({ provenance, segments, variants, doubtful, proposed }: Synopsis): string {
  const n = (k: number, one: string, more: string) => `${k} ${k === 1 ? one : more}`
  return `<p class="lead syn-summary">${[
    `${n(variants, 'Variante', 'Varianten')} ${mixBar(tally(counted(segments)))}`,
    doubtful && `${n(doubtful, 'Segment', 'Segmente')} zweifelhaft ausgerichtet`,
    proposed && `${n(proposed, 'andere Zeilenpaarung', 'andere Zeilenpaarungen')} vorgeschlagen`,
    provenance.checked ? `<b class="basis" data-basis="person">von Hand geprüft</b> ${provenance.checked} von ${segments.length} Segmenten`
      : '<span title="Automatisch ausgerichtet; die Typen sind Vorschläge, bis jemand sie bestätigt">noch ungeprüft</span>',
  ].filter(Boolean).join(' · ')}</p>`
}

/** Who aligned the poem and gave the types, at its foot. */
function sourceLine({ id, provenance, segments }: Synopsis): string {
  const count = (by?: string) => segments.flatMap((s) => s.apparatus).filter((e) => e.relation && e.relation.by === by).length
  const types = [[count('rule'), 'von Regeln'], [count('model'), 'vom Modell vorgeschlagen'], [count(), 'bestätigt']]
    .filter(([n]) => n).map(([n, who]) => `${n} ${who}`).join(', ')
  return `<p class="syn-source">
      Automatisch ausgerichtet ${provenance.tool ? `mit ${esc(provenance.tool)}` : 'in LERA'}, Verfahren <code>${esc(provenance.algorithm)}</code>${provenance.updated ? `, zuletzt geändert am ${esc(provenance.updated)}` : ''};
      ${types ? `Typen: ${types}; ` : ''}Datei <code>alignment/documents/${esc(id)}.json</code>.
      · <a href="synopsen.html">Alle Synopsen</a>
    </p>`
}

/** What the script reads to show, hide and count a place; a model's type it can take back. */
const placeAttrs = (e: Entry) =>
  `data-cat="${e.category}"${e.step ? ` data-step="${e.step}"` : ''}${e.relation?.by === 'model' ? ' data-by="model"' : ''}`

/**
 * What is left to check in a row: the alignment editor's doubts, and a model's
 * proposal to pair the lines otherwise — both settled in the editor, not here.
 */
function rowMarks(segment: Segment): string {
  const { doubts, proposal } = segment
  const [first, last] = [proposal?.rows[0], proposal?.rows.at(-1)]
  return (doubts.length ? `<span class="doubt" title="${esc(`Ausrichtung zweifelhaft: ${doubts.join('; ')}`)}">?</span>` : '') +
    (proposal ? `<span class="pairing" title="${esc(`Das Modell ${proposal.model} schlägt vor, die Zeilen ` +
      `${first === last ? `von Segment ${first}` : `der Segmente ${first}–${last}`} anders zu paaren` +
      `${proposal.rationale ? `: ${proposal.rationale}` : ''}. Annehmen oder verwerfen im Alignment-Editor.`)}">⇄</span>` : '')
}

export function synopsisPage(synopsis: Synopsis): string {
  const { id, title, witnesses, segments, units, groups, lines } = synopsis
  const entries = new Map(segments.flatMap((s) => s.apparatus.map((e) => [e.group, e])))
  const column = new Map(witnesses.map((w, i) => [w.siglum, i + 1]))

  // Rows in a row a witness has no text in: one band, labelled where it starts.
  const run = (i: number, siglum: string) => {
    let n = i
    while (segments[n + 1]?.missing.includes(siglum) && segments[n + 1].unit === segments[i].unit) n++
    return n - i + 1
  }
  const cell = (segment: Segment, witness: Witness, at: number): string => {
    const { siglum } = witness
    const w = ` data-w="${at}"`
    const i = segments.indexOf(segment)
    if (segment.missing.includes(siglum)) {
      const cont = i > 0 && segments[i - 1].missing.includes(siglum) && segments[i - 1].unit === segment.unit
      const more = i + 1 < segments.length && segments[i + 1].missing.includes(siglum) && segments[i + 1].unit === segment.unit
      const n = cont ? 0 : run(i, siglum)
      return `<td class="gap${cont ? ' cont' : ''}${more ? ' more' : ''}"${w} title="fehlt in ${esc(siglum)}">` +
        `${n ? `<span class="gap-label">fehlt${n > 1 ? ` · ${n} Zeilen` : ''}</span>` : ''}</td>`
    }
    const copied = segment.copy[siglum]
    const text = (segment.cells[siglum] ?? []).map((run) => {
      const entry = run.group ? entries.get(run.group) : undefined
      if (!entry) return esc(run.text)
      // `data-alike`: the columns reading the same here, for the *gegen* colourings.
      return `<span class="var" data-group="${esc(entry.group)}" ${placeAttrs(entry)} data-state="${entry.state}"` +
        ` data-degree="${entry.degree}" data-change="${entry.omission ? 'om' : 'sub'}"` +
        ` data-alike="${(entry.alike[siglum] ?? []).map((s) => column.get(s)).join(' ')}">` +
        `${marked(run.text, entry)}</span>`
    }).join('')
    // Back to the line this reading was taken from, in the edition it stands in.
    const mark = segment.refs[siglum]?.[0]
    const place = mark ? lines[mark] : undefined
    const jump = place && witness.href
      ? `<a class="line-link no-print" title="Diese Zeile in ${esc(siglum)}"` +
        ` href="${esc(witness.href.split('#')[0])}#${esc(id)}-l${place}">↗</a>`
      : ''
    return `<td${copied ? ' class="copy"' : ''}${w}${copied ? ` title="wie Segment ${copied}"` : ''}>${text}${jump}</td>`
  }

  /** A segment's places in a column of their own, beside its row: one compact line each. */
  const apparatus = (segment: Segment): string => {
    if (!segment.apparatus.length && !segment.line) return '<td class="app"></td>'
    const at = (sigla: string[]) => sigla.map((s) => column.get(s)).join(' ')
    // A run of such rows is said once, at its first; the others still count.
    const i = segments.indexOf(segment)
    const cont = Boolean(segment.line) && i > 0 && segments[i - 1].line === segment.line && segments[i - 1].unit === segment.unit &&
      segments[i - 1].missing.join() === segment.missing.join()
    let n = 1
    while (segment.line && !cont && segments[i + n]?.line === segment.line && segments[i + n].unit === segment.unit &&
      segments[i + n].missing.join() === segment.missing.join()) n++
    const line = segment.line ? `<li data-cat="${segment.line}" data-missing="${at(segment.missing)}" data-present="${at(Object.keys(segment.cells))}"${cont ? ' class="cont"' : ''}>
            ${n > 1 ? `${n} ganze Zeilen (${segment.n}–${segment.n + n - 1})` : 'Ganze Zeile'}: fehlt in ${segment.missing.map(esc).join(' ')}
          </li>` : ''
    const items = line + segment.apparatus.map((e) => `<li data-group="${esc(e.group)}" ${placeAttrs(e)} data-apart="${apartPairs(e, column).join(' ')}">
            ${lemmatised(e)}${e.relation ? relationLabel(e.relation) : ''}
          </li>`).join('')
    return `<td class="app"><ul class="app-list">${items}</ul></td>`
  }

  const row = (segment: Segment): string => {
    const classes = [segment.head && 'is-head', !segment.differs && 'quiet'].filter(Boolean).join(' ')
    return `<tr id="seg-${segment.n}"${classes ? ` class="${classes}"` : ''}>
        <td class="num"${marks(segment) ? ` title="${esc(marks(segment))}"` : ''}><a
          href="#seg-${segment.n}" data-syn-link>${segment.n}</a>${rowMarks(segment)}</td>
        ${witnesses.map((w, i) => cell(segment, w, i + 1)).join('')}
        ${apparatus(segment)}
      </tr>`
  }

  /** A bundle is read poem by poem: one tbody each, under a band that stays in view. */
  const body = units.length > 1
    ? units.map((unit, i) => `<tbody>
        <tr class="unit"><th colspan="${witnesses.length + 2}">
          <span class="unit-n">${unit.n}/${units.length}</span> <b>${esc(unit.title)}</b>
          <span class="unit-meta">${unit.length} Segmente · ${unit.variants}${
            unit.variants === 1 ? ' Variante' : ' Varianten'}</span></th></tr>
        ${segments.filter((segment) => segment.unit === i).map(row).join('')}
      </tbody>`).join('')
    : `<tbody>${segments.map(row).join('')}</tbody>`

  // Stacked on a phone, each cell names its witness.
  const sigla = `<style>${witnesses.map((w, i) => `.synopsis [data-w="${i + 1}"]{--siglum:${JSON.stringify(w.siglum)}}`).join('')}</style>`
  return corpusPage('', `${title} · Synopse`, `
    ${summaryLine(synopsis)}
    <div data-synopsis data-colour="type">
      ${synopsisControls(synopsis)}
      ${unitList(units)}
      <div class="synopsis-wrap">
      <table class="synopsis">
        <thead>
          <tr>
            <th class="num">#</th>
            ${witnesses.map((w, i) => `<th data-w="${i + 1}">${w.href ? `<a href="${esc(w.href)}">${esc(w.siglum)}</a>` : esc(w.siglum)}</th>`).join('')}
            <th class="app">Apparat</th>
          </tr>
        </thead>
        ${body}
      </table>
      ${minimap(synopsis)}
      </div>
      ${readingRegister(groups)}
      ${pairMatrix(witnesses, segments)}
    </div>
    ${sourceLine(synopsis)}`,
    { styles: `<link rel="stylesheet" href="assets/synopsis.css">${PALETTE}${sigla}`,
      script: '<script src="assets/store.js"></script><script src="assets/synopsis.js"></script>' })
}

/** What is aligned so far, and what it cost: the worklist's public side. */
export function synopsesPage(synopses: Synopsis[]): string {
  const rows = synopses.map((s) => {
    const counts = tally(counted(s.segments))
    // What the sort reads: every count, by its name.
    const keys = CATEGORIES.map((c) => ` data-${c}="${counts.get(c) ?? 0}"`).join('')
    return `<tr data-variants="${s.variants}" data-doubtful="${s.doubtful}" data-segments="${s.segments.length}"${keys}>
          <td><a href="${esc(synopsisHref(s.id))}">${esc(s.title)}</a></td>
          <td class="file">${esc(s.id)}</td>
          <td>${basisTag(s.provenance)}${s.provenance.checked ? ' <b class="basis" data-basis="person">geprüft</b>' : ''}</td>
          <td>${s.witnesses.map((w) => esc(w.siglum)).join(', ')}</td>
          <td class="num">${s.segments.length}</td>
          <td class="num">${s.variants}</td>
          <td>${mixBar(counts)}</td>
          <td>${stripsOf(s, false)}</td>
          <td class="num">${s.doubtful || ''}</td>
        </tr>`
  }).join('')
  const sorts = [['', 'Gedicht'], ['data-variants', 'Varianten'], ['data-doubtful', 'zweifelhaft'], ['data-segments', 'Segmente'],
    ...CATEGORIES.map((c) => [`data-${c}`, CATEGORY_LABELS[c][0]])]

  return corpusPage('synopsen.html', `Synopsen · ${synopses.length}`, `
    <p class="lead">
      Gedichte, die in mehreren Ausgaben stehen. Jede Synopse stellt die Fassungen nebeneinander
      und hebt die Abweichungen hervor. <i>Grundlage</i> sagt, wer ausgerichtet hat — TextAlign
      oder LERA, beide automatisch — und ob eine Person die Ausrichtung geprüft hat;
      <i>zweifelhaft</i> zählt die Segmente, deren Ausrichtung noch jemand prüfen sollte.
      <i>Arten</i> teilt die Varianten nach Kategorie, <i>Verlauf</i> zeigt je Textzeuge, wo im Gedicht Zeilen fehlen und wo er abweicht.
    </p>
    ${synopses.length ? `<p class="no-print"><label class="ctrl">Sortieren nach
      <select data-syn-sort>${sorts.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label></p>
    <table class="syn-poems">
      <thead>
        <tr><th>Gedicht</th><th>ID</th><th>Grundlage</th><th>Textzeugen</th>
          <th class="num">Segmente</th><th class="num">Varianten</th><th>Arten</th><th>Verlauf</th><th class="num">zweifelhaft</th></tr>
      </thead>
      <tbody data-syn-rows>${rows}</tbody>
    </table>
    ${corpusRegister(synopses)}` : '<p class="lead">Noch keine Ausrichtung vorhanden.</p>'}`,
    { styles: `<link rel="stylesheet" href="assets/synopsis.css">${PALETTE}`, script: '<script src="assets/synopsis.js"></script>' })
}
