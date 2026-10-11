/**
 * The synopsis pages: a poem as its witnesses read it side by side.
 *
 * Kept apart from `page.ts`, which renders the TEI the ODD describes. This
 * knows nothing about the ODD, and the reading pages load none of its assets.
 */

import { charDiff, type Entry, type Group, type Segment, type Synopsis, type Unit, type Witness } from './alignments'
import { corpusPage, esc } from './page'

/** Where a poem's synopsis lives; the pages sit flat beside the documents. */
export const synopsisHref = (id: string): string => `synopse-${encodeURIComponent(id)}.html`

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
    return `<i data-row="${segment.n}" data-varies="${segment.varies}" data-level="${level}"` +
      `${units.length > 1 && segment.head ? ' class="tick"' : ''} style="top:${at}%"></i>`
  }
  return `<div class="syn-strip no-print" data-syn-strip title="Das ganze Gedicht: je Segment eine Linie, je länger desto mehr weichen die Textzeugen ab. Klicken oder ziehen führt dorthin.">
      ${segments.map(line).join('')}<u class="syn-here"></u>
    </div>`
}

/**
 * How the marks are coloured, and what each shade means.
 *
 * The legend's swatches are the same elements the table uses, with the same
 * attributes, so the stylesheet colours both from one rule and the legend
 * cannot come to say something the page does not do.
 */
const COLOURS: Record<string, { label: string, keys: [string, string][] }> = {
  variance: {
    label: 'nach Varianz',
    keys: [['data-degree="1"', 'zwei Lesarten'], ['data-degree="2"', 'drei'], ['data-degree="3"', 'vier oder mehr']],
  },
  change: {
    label: 'nach Art',
    keys: [['data-change="sub"', 'andere Lesart'], ['data-change="om"', 'fehlt bei einem Textzeugen']],
  },
}

/** A legend entry: a word marked as the table marks it, and what that means. */
const swatch = (attrs: string, label: string) =>
  `<span class="syn-swatch"><span class="var" ${attrs}><b>Aa</b></span> ${label}</span>`

const legend = (): string => Object.entries(COLOURS).map(([mode, { keys }]) =>
  `<span class="syn-keys" data-for="${mode}">${keys.map(([attrs, label]) => swatch(attrs, label)).join('')}</span>`).join('')

/**
 * The reading options above a synopsis.
 *
 * Each control sets one attribute on the table; the stylesheet does the rest,
 * so the page is still right with no script - it starts with everything shown.
 */
function synopsisControls(witnesses: Witness[], bundle: boolean): string {
  const witness = (w: Witness, i: number) =>
    `<label><input type="checkbox" data-syn-witness="${i + 1}" checked> ${esc(w.siglum)}</label>`
  const base = witnesses.map((w, i) => `<option value="${i + 1}">${esc(w.siglum)}</option>`).join('')

  return `<form class="syn-bar no-print" data-syn-controls>
      <label class="ctrl" title="Varianten, die nur die Schreibung betreffen (ſ/s, u/v, i/j, Virgel), von sachlichen trennen">
        Varianten
        <select data-syn="variants">
          <option value="all">alle</option>
          <option value="words">nur sachliche</option>
          <option value="off">keine</option>
        </select>
      </label>
      ${bundle ? '<label class="ctrl" title="Wo im Band ein Gedicht anfängt, und was es enthält">' +
        '<input type="checkbox" data-syn="units"> Gedichte</label>' : ''}
      <label class="ctrl" title="Wonach die Markierungen eingefärbt werden">
        Färbung
        <select data-syn="colour">${Object.entries(COLOURS).map(([mode, { label }]) =>
          `<option value="${mode}">${label}</option>`).join('')}</select>
      </label>
      <label class="ctrl"><input type="checkbox" data-syn="varying"> nur Abweichungen</label>
      <label class="ctrl"><input type="checkbox" data-syn="apparatus"> Apparat</label>
      <label class="ctrl" title="Ein Textzeuge als Bezugstext; die anderen zeigen nur, wo sie abweichen">
        Basis
        <select data-syn="base"><option value="">keine</option>${base}</select>
      </label>
      <span class="ctrl syn-witnesses">Textzeugen ${witnesses.map(witness).join('')}</span>
      <output class="ctrl syn-count" data-syn-count title="n und p springen zur nächsten Abweichung"></output>
    </form>`
}

/**
 * One poem, as its witnesses read it side by side.
 *
 * A row is one of LERA's segments, a column one witness. Words LERA marked as
 * varying carry their apparatus id, so pointing at a reading marks the readings
 * that answer it in the other columns — the correspondence the export states
 * and a static table otherwise loses. How much is shown is the reader's to
 * choose; see `synopsisControls`.
 */
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
  const item = (group: Group) => {
    const forms = group.forms.map((form) =>
      form ? `<b>${esc(form)}</b>` : '<i>fehlt</i>').join(' <span class="sep">|</span> ')
    const where = group.places.slice(0, 12).map((n) =>
      `<a href="#seg-${n}">${n}</a>`).join(' ')
    return `<li data-kind="${group.spelling ? 'spelling' : 'word'}">${forms}
        <span class="count">×${group.places.length}</span>
        <span class="places">${where}${group.places.length > 12 ? ' …' : ''}</span>
      </li>`
  }
  return `<details class="syn-register">
      <summary>Lesarten: ${groups.length} verschiedene an ${places} Stellen</summary>
      <ol>${groups.map(item).join('')}</ol>
    </details>`
}

/**
 * How a place is classified. What a rule or a model proposed and nobody has
 * confirmed says so, and is never shown as the edition's judgement.
 */
function relationLabel(r: NonNullable<Entry['relation']>): string {
  const sure = r.confidence === undefined ? '' : ` ${Math.round(r.confidence * 100)} %`
  const who = r.by === 'model' ? `Modell${sure}` : r.by === 'rule' ? 'Regel' : ''
  const title = [who && `${who}, nicht bestätigt`, r.model, r.rationale].filter(Boolean).join(' · ')
  return `<span class="app-rel"${r.by ? ` data-by="${esc(r.by)}"` : ''}${title ? ` title="${esc(title)}"` : ''}>` +
    `${esc(r.type)}${who ? ` <small>${esc(who)}</small>` : ''}</span>`
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

/** The source line ids a row holds, all witnesses', for its number's title. */
const marks = (segment: Segment): string => Object.values(segment.refs).flat().join(', ')

export function synopsisPage(synopsis: Synopsis): string {
  const { id, title, witnesses, segments, units, groups, variants, lines, provenance } = synopsis
  const degrees = new Map(segments.flatMap((s) => s.apparatus.map((e) => [e.group, e])))

  const cell = (segment: Segment, witness: Witness, column: number): string => {
    const { siglum } = witness
    const at = ` data-w="${column}"`
    if (segment.missing.includes(siglum)) return `<td class="gap"${at} title="fehlt"></td>`
    const copied = segment.copy[siglum]
    const text = (segment.cells[siglum] ?? []).map((run) => {
      if (!run.group) return `<span class="same">${esc(run.text)}</span>`
      const entry = degrees.get(run.group)
      const kind = entry?.spelling ? 'spelling' : 'word'
      return `<span class="var" data-group="${esc(run.group)}" data-kind="${kind}"` +
        ` data-degree="${entry?.degree ?? 1}" data-change="${entry?.omission ? 'om' : 'sub'}">` +
        `${marked(run.text, entry)}</span>`
    }).join('')
    // Back to the line this reading was taken from, in the edition it stands in.
    const mark = segment.refs[siglum]?.[0]
    const place = mark ? lines[mark] : undefined
    const jump = place && witness.href
      ? `<a class="line-link no-print" title="Diese Zeile in ${esc(siglum)}"` +
        ` href="${esc(witness.href.split('#')[0])}#${esc(id)}-l${place}">↗</a>`
      : ''
    return `<td${copied ? ' class="copy"' : ''}${at}${copied ? ` title="wie Segment ${copied}"` : ''}>${text}${jump}</td>`
  }

  /** The readings of one place, as a printed apparatus gives them. */
  const apparatus = (segment: Segment): string => {
    if (!segment.apparatus.length) return ''
    const entries = segment.apparatus.map((e) => `<li data-group="${esc(e.group)}"
            data-kind="${e.spelling ? 'spelling' : 'word'}">
            ${Object.entries(e.readings).map(([siglum, reading]) =>
              `<span><i>${esc(siglum)}</i> ${reading.trim() ? esc(reading) : '—'}</span>`).join('')}
            ${e.relation ? relationLabel(e.relation) : ''}
          </li>`).join('')
    return `<tr class="app" data-varies="${segment.varies}"
        data-kind="${segment.apparatus.every((e) => e.spelling) ? 'spelling' : 'word'}">
        <td class="num"></td>
        <td colspan="${witnesses.length}"><ol class="app-list">${entries}</ol></td>
      </tr>`
  }

  const row = (segment: Segment): string => `<tr id="seg-${segment.n}" data-varies="${segment.varies}"${segment.head ? ' class="is-head"' : ''}>
        <td class="num"${marks(segment) ? ` title="${esc(marks(segment))}"` : ''}><a
          href="#seg-${segment.n}" data-syn-link>${segment.n}</a></td>
        ${witnesses.map((w, i) => cell(segment, w, i + 1)).join('')}
      </tr>${apparatus(segment)}`

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
    </p>
    ${synopsisControls(witnesses, units.length > 1)}
    <div data-synopsis data-variants="all" data-colour="variance">
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
      <p class="syn-legend">
      ${legend()}
      <span class="syn-swatch"><b>—</b> kein Text in diesem Textzeugen</span>
      <span class="syn-swatch"><span class="copy">grau</span> LERA wiederholt ein früheres Segment</span>
      <span class="syn-swatch"><span class="line-link">↗</span> zur Zeile in der Ausgabe</span>
      </p>
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
  const rows = synopses.map((s) => `<tr>
          <td><a href="${esc(synopsisHref(s.id))}">${esc(s.title)}</a></td>
          <td class="file">${esc(s.id)}</td>
          <td>${s.witnesses.map((w) => esc(w.siglum)).join(', ')}</td>
          <td class="num">${s.segments.length}</td>
          <td class="num">${s.variants}</td>
        </tr>`).join('')

  return corpusPage('synopsen.html', `Synopsen · ${synopses.length}`, `
    <p class="lead">
      Gedichte, die in mehreren Ausgaben stehen und in LERA ausgerichtet wurden.
      Jede Synopse stellt die Fassungen nebeneinander und hebt die Abweichungen hervor.
    </p>
    ${synopses.length ? `<table>
      <thead>
        <tr><th>Gedicht</th><th>ID</th><th>Textzeugen</th>
          <th class="num">Segmente</th><th class="num">Varianten</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>` : '<p class="lead">Noch keine Ausrichtung vorhanden.</p>'}`)
}
