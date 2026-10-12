/**
 * The synopsis pages: a poem as its witnesses read it side by side.
 *
 * Kept apart from `page.ts`, which renders the TEI the ODD describes. This
 * knows nothing about the ODD, and the reading pages load none of its assets.
 */

import { CATEGORIES, charDiff, FILTERS, type Category, type Entry, type Group, type Segment, type Synopsis, type Unit, type Witness } from './alignments'
import { corpusPage, esc } from './page'

/** Where a poem's synopsis lives; the pages sit flat beside the documents. */
export const synopsisHref = (id: string): string => `synopse-${encodeURIComponent(id)}.html`

/** The categories as the reader sees them: a name, and what it holds. */
const CATEGORY_LABELS: Record<Category, [string, string]> = {
  punctuation: ['Interpunktion', 'Nur die Zeichensetzung unterscheidet sich'],
  spelling: ['Schreibung', 'Ein Wort, anders geschrieben — Orthographie (u/v, i/j, ſ, Groß/klein, Diakritika) oder Schreibung (Doppelkonsonanten, ck/k …)'],
  grammatical: ['Grammatik', 'Dasselbe Wort in anderer Form: Kasus, Numerus, Tempus …'],
  lexical: ['Wortlaut', 'Ein anderes Wort oder eine andere Formulierung'],
  order: ['Umstellung', 'Dieselben Wörter in anderer Folge, oder ein Wort doppelt'],
  omission: ['Auslassung', 'Ein Textzeuge liest hier nichts'],
  other: ['Sonstige', 'Unsicher, oder keiner der anderen Typen'],
  open: ['offen', 'Noch nicht klassifiziert'],
}
/** What *sachliche* leaves out. */
const SPELLING: Category[] = ['punctuation', 'spelling']

/** The relation types, as the apparatus names them. */
const TYPE_LABELS: Record<string, string> = {
  punctuation: 'Interpunktion', orthographic: 'Orthographie', spelling: 'Schreibung', grammatical: 'Grammatik',
  lexical: 'Wortlaut', transposition: 'Umstellung', repetition: 'Wiederholung', uncertain: 'unsicher', other: 'sonstige',
}

const FILTER_LABELS: Record<(typeof FILTERS)[number], string> = {
  punctuation: 'Interpunktion', case: 'Groß/klein', diacritics: 'Diakritika', 'long-s': 'ſ/s',
}

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
 * The poem as a strip beside the table: a line per segment, as long and as dark
 * as that segment's widest disagreement, a tick where a poem of a bundle
 * begins, and a marker for what is on screen. Click or drag it to move.
 *
 * Without script it is still the shape of the poem's variance, evenly spaced by
 * segment; the script places each line at its row's real position and follows
 * the scrolling.
 */
function synopsisStrip(synopsis: Synopsis): string {
  const { segments, units } = synopsis
  const line = (segment: Segment, i: number) => {
    const level = Math.max(0, ...Object.values(segment.departures))
    const at = (i / segments.length * 100).toFixed(3)
    const classes = [units.length > 1 && segment.head && 'tick', !segment.differs && 'quiet',
      (segment.doubts.length || segment.proposal) && 'doubt'].filter(Boolean).join(' ')
    return `<i data-row="${segment.n}" data-level="${level}"${classes ? ` class="${classes}"` : ''} style="top:${at}%"></i>`
  }
  return `<div class="syn-strip no-print" data-syn-strip title="Das ganze Gedicht: je Segment eine Linie, je länger desto mehr weichen die Textzeugen ab. Klicken oder ziehen führt dorthin.">
      ${segments.map(line).join('')}<u class="syn-here"></u>
    </div>`
}

/**
 * How the marks are coloured, and what each shade means: one table for the
 * select and the legend. The legend's swatches are the same elements the table
 * uses, with the same attributes, so the stylesheet colours both from one rule
 * and the legend cannot come to say something the page does not do.
 */
function colours(witnesses: Witness[]): Record<string, { label: string, keys: [string, string][] }> {
  return {
    variance: {
      label: 'nach Varianz',
      keys: [['data-degree="1"', 'zwei Lesarten'], ['data-degree="2"', 'drei'], ['data-degree="3"', 'vier oder mehr']],
    },
    type: {
      label: 'nach Typ',
      keys: CATEGORIES.map((c) => [`data-cat="${c}"`, CATEGORY_LABELS[c][0]]),
    },
    state: {
      label: 'nach Stand',
      keys: [['data-state="significant"', 'bestätigt, erheblich'], ['data-state="confirmed"', 'bestätigt'],
        ['data-state="proposed"', 'von Regel oder Modell vorgeschlagen'], ['data-state="open"', 'offen']],
    },
    change: {
      label: 'nach Art',
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
 * the page shows everything, coloured by variance.
 */
function synopsisControls(synopsis: Synopsis): string {
  const { witnesses, units, segments, doubtful, proposed } = synopsis
  const counts = tally(segments.flatMap((s) => s.apparatus))
  const modes = colours(witnesses)
  const machine = segments.some((s) => s.apparatus.some((e) => e.relation?.by === 'model'))

  const chip = (c: Category) => `<label class="syn-chip" title="${esc(CATEGORY_LABELS[c][1])}" data-n="${counts.get(c) ?? 0}">` +
    `<input type="checkbox" data-syn-cat="${c}" checked> ${CATEGORY_LABELS[c][0]} <span class="n">${counts.get(c) ?? 0}</span></label>`
  const filter = (f: (typeof FILTERS)[number], bit: number) =>
    `<label class="ctrl"><input type="checkbox" data-syn-ignore="${bit}"> ${FILTER_LABELS[f]}</label>`
  const witness = (w: Witness, i: number) =>
    `<label><input type="checkbox" data-syn-witness="${i + 1}" checked> ${esc(w.siglum)}</label>`

  return `<form class="syn-bar no-print" data-syn-controls>
      ${mixBar(counts, true)}
      <div class="syn-row">
        <span class="syn-label">Varianten</span>
        ${CATEGORIES.map(chip).join('')}
        <span class="syn-presets">
          <button type="button" data-syn-preset="${CATEGORIES.join(' ')}">alle</button>
          <button type="button" data-syn-preset="${CATEGORIES.filter((c) => !SPELLING.includes(c)).join(' ')}"
            title="Ohne Interpunktion und Schreibung">sachliche</button>
          <button type="button" data-syn-preset="">keine</button>
        </span>
      </div>
      <div class="syn-row" title="Was beim Vergleich nicht als Unterschied zählt">
        <span class="syn-label">Vergleich ohne</span>
        ${FILTERS.map(filter).join('')}
      </div>
      <div class="syn-row">
        <label class="ctrl"><span class="syn-label">Färbung</span>
          <select data-syn="colour">${Object.entries(modes).map(([mode, { label }]) =>
            `<option value="${mode}">${esc(label)}</option>`).join('')}</select>
        </label>
        <label class="ctrl"><input type="checkbox" data-syn="varying"> nur Abweichungen</label>
        <label class="ctrl"><input type="checkbox" data-syn="apparatus"> Apparat</label>
        ${machine ? '<label class="ctrl" title="Typen, die ein Sprachmodell vorgeschlagen und noch niemand bestätigt hat; ' +
          'ohne sie zählen diese Stellen als offen"><input type="checkbox" data-syn-model checked> Modellvorschläge</label>' : ''}
        ${units.length > 1 ? '<label class="ctrl" title="Wo im Band ein Gedicht anfängt, und was es enthält">' +
          '<input type="checkbox" data-syn="units"> Gedichte</label>' : ''}
        <span class="ctrl syn-witnesses"><span class="syn-label">Textzeugen</span> ${witnesses.map(witness).join('')}</span>
        <output class="ctrl syn-count" data-syn-count title="n und p springen zur nächsten Abweichung"></output>
      </div>
    </form>
    <p class="syn-legend no-print">
      ${Object.entries(modes).map(([mode, { keys }]) =>
        `<span class="syn-keys" data-for="${mode}">${keys.map(([attrs, label]) => swatch(attrs, label)).join('')}</span>`).join('')}
      <span class="syn-swatch"><b>—</b> kein Text</span>
      <span class="syn-swatch"><span class="copy">grau</span> wiederholt ein früheres Segment</span>
      <span class="syn-swatch"><span class="line-link">↗</span> zur Zeile in der Ausgabe</span>
      ${doubtful ? '<span class="syn-swatch"><span class="doubt">?</span> Ausrichtung zweifelhaft</span>' : ''}
      ${proposed ? '<span class="syn-swatch"><span class="pairing">⇄</span> andere Zeilenpaarung vorgeschlagen</span>' : ''}
    </p>`
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
  const sections = CATEGORIES.map((c) => [c, groups.filter((g) => g.category === c)] as const).filter(([, gs]) => gs.length)
  const item = (group: Group) => {
    const forms = group.forms.map((form) =>
      form ? `<b>${esc(form)}</b>` : '<i>fehlt</i>').join(' <span class="sep">|</span> ')
    const where = group.places.slice(0, 12).map((n) =>
      `<a href="#seg-${n}">${n}</a>`).join(' ')
    return `<li data-cat="${group.category}" data-gone="${group.gone}"${group.by === 'model' ? ' data-by="model"' : ''}>${forms}
        <span class="count">×${group.places.length}</span>
        <span class="places">${where}${group.places.length > 12 ? ' …' : ''}</span>
      </li>`
  }
  return `<details class="syn-register">
      <summary>Lesarten: ${groups.length} verschiedene an ${places} Stellen</summary>
      ${sections.map(([c, gs]) => `<h4>${CATEGORY_LABELS[c][0]} <span class="count">${gs.length}</span></h4>
      <ol>${gs.map(item).join('')}</ol>`).join('')}
    </details>`
}

/** Places per category. */
function tally(entries: Entry[]): Map<Category, number> {
  const counts = new Map<Category, number>()
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  return counts
}

/**
 * A poem's variants as one bar split by category, in the type colours. On a
 * synopsis each part is a preset: a click shows that category alone.
 */
function mixBar(counts: Map<Category, number>, presets = false): string {
  const part = (c: Category) => {
    const n = counts.get(c)
    if (!n) return ''
    const label = esc(`${CATEGORY_LABELS[c][0]} ${n}`)
    return presets
      ? `<button type="button" data-cat="${c}" data-syn-preset="${c}" style="flex-grow:${n}" title="${label} — nur diese zeigen"></button>`
      : `<i data-cat="${c}" style="flex-grow:${n}" title="${label}"></i>`
  }
  return counts.size ? `<span class="syn-mix">${CATEGORIES.map(part).join('')}</span>` : ''
}

/**
 * Witness against witness: at how many places two read otherwise, counting
 * only what is neither spelling nor punctuation — which edition stands closest
 * to which. Two witnesses need no table: that is the poem's count.
 */
function pairMatrix(witnesses: Witness[], entries: Entry[]): string {
  if (witnesses.length < 3) return ''
  const sigla = witnesses.map((w) => w.siglum)
  const apart = (a: string, b: string) => entries.filter((e) => a in e.readings && b in e.readings && !e.alike[a].includes(b))
  const counts = sigla.map((a) => sigla.map((b) => {
    const all = a === b ? [] : apart(a, b)
    return [all.filter((e) => !SPELLING.includes(e.category)).length, all.length]
  }))
  const most = Math.max(1, ...counts.flat().map(([n]) => n))
  const cell = ([n, all]: number[], a: string, b: string) => a === b ? '<td></td>'
    : `<td style="--k:${(n / most).toFixed(2)}" title="${esc(`${a} gegen ${b}: ${n} sachliche von ${all} Stellen`)}">${n}</td>`
  return `<details class="syn-pairs">
      <summary>Textzeugen paarweise: sachliche Abweichungen</summary>
      <table>
        <tr><th></th>${sigla.map((s) => `<th>${esc(s)}</th>`).join('')}</tr>
        ${sigla.map((a, i) => `<tr><th>${esc(a)}</th>${sigla.map((b, j) => cell(counts[i][j], a, b)).join('')}</tr>`).join('')}
      </table>
    </details>`
}

/**
 * How much a poem varies, and where: its segments in at most 60 bins, each as
 * high as the widest disagreement in it — the strip's scale, in small.
 */
function sparkline(segments: Segment[]): string {
  const bins = Math.min(60, segments.length)
  const level = (i: number) => Math.max(0, ...segments
    .slice(Math.floor(i * segments.length / bins), Math.floor((i + 1) * segments.length / bins))
    .flatMap((s) => Object.values(s.departures)))
  const bars = Array.from({ length: bins }, (_, i) => level(i))
    .map((l, i) => l > 0 ? `<rect x="${i}" y="${3 - l}" width="0.8" height="${l}"/>` : '').join('')
  return `<svg class="syn-spark" viewBox="0 0 ${bins} 3" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`
}

/**
 * The reading sets that recur from poem to poem, most frequent first: the
 * printers' habits across the corpus (`vnd | und`), with where they occur.
 */
function corpusRegister(synopses: Synopsis[]): string {
  const sets = new Map<string, { forms: string[], category: Category, places: number, poems: string[] }>()
  for (const s of synopses) {
    for (const g of s.groups) {
      const key = [...g.forms].sort().join('\u0001')
      const set = sets.get(key) ?? { forms: g.forms, category: g.category, places: 0, poems: [] }
      set.places += g.places.length
      set.poems.push(s.id)
      sets.set(key, set)
    }
  }
  const recurring = [...sets.values()].filter((s) => s.poems.length > 1).sort((a, b) => b.places - a.places)
  if (!recurring.length) return ''
  const item = (s: (typeof recurring)[number]) => `<li data-cat="${s.category}">
        ${s.forms.map((f) => f ? `<b>${esc(f)}</b>` : '<i>fehlt</i>').join(' <span class="sep">|</span> ')}
        <span class="count">×${s.places} in ${s.poems.length} Gedichten</span>
        <span class="places">${s.poems.slice(0, 8).map((id) => `<a href="${esc(synopsisHref(id))}">${esc(id)}</a>`).join(' ')}${s.poems.length > 8 ? ' …' : ''}</span>
      </li>`
  return `<details class="syn-register">
      <summary>Wiederkehrende Lesarten: ${recurring.length} Sätze in mehr als einem Gedicht, die häufigsten zuerst</summary>
      <ol>${recurring.slice(0, 200).map(item).join('')}</ol>
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
 * What the page rests on, said before anything else: who aligned it, whether a
 * person has checked it, and who gave the types — a machine's work looks no
 * different from a person's on the page, so this line is what tells them apart.
 */
function basisLine(synopsis: Synopsis): string {
  const { provenance, segments } = synopsis
  const entries = segments.flatMap((s) => s.apparatus)
  const count = (by?: string) => entries.filter((e) => e.relation && e.relation.by === by).length
  const how = `automatisch ausgerichtet${provenance.algorithm ? ` (<code>${esc(provenance.algorithm)}</code>)` : ''}`
  const checked = provenance.checked
    ? `<b class="basis" data-basis="person">von Hand geprüft</b> ${provenance.checked} von ${segments.length} Segmenten`
    : 'noch von niemandem geprüft'
  const types = [[count('rule'), 'von Regeln'], [count('model'), 'vom Modell vorgeschlagen'], [count(), 'bestätigt']]
    .filter(([n]) => n).map(([n, who]) => `${n} ${who}`).join(', ')
  return `<p class="syn-basis">${basisTag(provenance)} ${how} · ${checked}${types ? ` · Typen: ${types}` : ''}</p>`
}

/** What the script reads to show, hide and count a place; a model's type it can take back. */
const placeAttrs = (e: Entry) =>
  `data-cat="${e.category}" data-gone="${e.gone}"${e.relation?.by === 'model' ? ' data-by="model"' : ''}`

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
  const { id, title, witnesses, segments, units, groups, variants, doubtful, proposed, lines, provenance } = synopsis
  const entries = new Map(segments.flatMap((s) => s.apparatus.map((e) => [e.group, e])))
  const column = new Map(witnesses.map((w, i) => [w.siglum, i + 1]))

  const cell = (segment: Segment, witness: Witness, at: number): string => {
    const { siglum } = witness
    const w = ` data-w="${at}"`
    if (segment.missing.includes(siglum)) return `<td class="gap"${w} title="fehlt"></td>`
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

  /** A segment's places under its row, one line of apparatus each. */
  const apparatus = (segment: Segment): string => {
    if (!segment.apparatus.length) return ''
    const items = segment.apparatus.map((e) => `<li data-group="${esc(e.group)}" ${placeAttrs(e)}>
            ${lemmatised(e)}${e.relation ? relationLabel(e.relation) : ''}
          </li>`).join('')
    return `<tr class="app">
        <td class="num"></td>
        <td colspan="${witnesses.length}"><ol class="app-list">${items}</ol></td>
      </tr>`
  }

  const row = (segment: Segment): string => {
    const classes = [segment.head && 'is-head', !segment.differs && 'quiet'].filter(Boolean).join(' ')
    return `<tr id="seg-${segment.n}"${classes ? ` class="${classes}"` : ''}>
        <td class="num"${marks(segment) ? ` title="${esc(marks(segment))}"` : ''}><a
          href="#seg-${segment.n}" data-syn-link>${segment.n}</a>${rowMarks(segment)}</td>
        ${witnesses.map((w, i) => cell(segment, w, i + 1)).join('')}
      </tr>${apparatus(segment)}`
  }

  /** A bundle is read poem by poem: one tbody each, under a band that stays in view. */
  const body = units.length > 1
    ? units.map((unit, i) => `<tbody>
        <tr class="unit"><th colspan="${witnesses.length + 1}">
          <span class="unit-n">${unit.n}/${units.length}</span> <b>${esc(unit.title)}</b>
          <span class="unit-meta">${unit.length} Segmente · ${unit.variants}${
            unit.variants === 1 ? ' Variante' : ' Varianten'}</span></th></tr>
        ${segments.filter((segment) => segment.unit === i).map(row).join('')}
      </tbody>`).join('')
    : `<tbody>${segments.map(row).join('')}</tbody>`

  return corpusPage('', `${title} · Synopse`, `
    <p class="lead">
      ${witnesses.length} Textzeugen, ${segments.length} Segmente, ${variants} Varianten.
      ${doubtful ? `${doubtful} ${doubtful === 1 ? 'Segment ist' : 'Segmente sind'} zweifelhaft ausgerichtet.` : ''}
      ${proposed ? `Für ${proposed} schlägt ein Modell eine andere Zeilenpaarung vor.` : ''}
    </p>
    ${basisLine(synopsis)}
    <div data-synopsis data-colour="variance">
      ${synopsisControls(synopsis)}
      ${unitList(units)}
      ${synopsisStrip(synopsis)}
      <div class="synopsis-wrap">
      <table class="synopsis">
        <thead>
          <tr>
            <th class="num">#</th>
            ${witnesses.map((w, i) => `<th data-w="${i + 1}">${w.href ? `<a href="${esc(w.href)}">${esc(w.siglum)}</a>` : esc(w.siglum)}</th>`).join('')}
          </tr>
        </thead>
        ${body}
      </table>
      </div>
      ${readingRegister(groups)}
      ${pairMatrix(witnesses, segments.flatMap((s) => s.apparatus))}
    </div>
    <p class="syn-source">
      ${provenance.tool ? `Ausgerichtet mit ${esc(provenance.tool)}` : `Ausgerichtet in LERA`}, Verfahren
      <code>${esc(provenance.algorithm)}</code>${provenance.updated ? `, zuletzt geändert am ${esc(provenance.updated)}` : ''};
      Datei <code>alignment/documents/${esc(id)}.json</code>.
      · <a href="synopsen.html">Alle Synopsen</a>
    </p>`,
    { styles: '<link rel="stylesheet" href="assets/synopsis.css">',
      script: '<script src="assets/store.js"></script><script src="assets/synopsis.js"></script>' })
}

/** What is aligned so far, and what it cost: the worklist's public side. */
export function synopsesPage(synopses: Synopsis[]): string {
  const rows = synopses.map((s) => {
    const counts = tally(s.segments.flatMap((segment) => segment.apparatus))
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
          <td>${sparkline(s.segments)}</td>
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
      <i>Arten</i> teilt die Varianten nach Kategorie, <i>Verlauf</i> zeigt, wo im Gedicht sie stehen.
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
    { styles: '<link rel="stylesheet" href="assets/synopsis.css">', script: '<script src="assets/synopsis.js"></script>' })
}
