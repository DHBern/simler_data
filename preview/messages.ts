/** The package's findings as the preview's pages say them. */

import type { Finding, FindingCode } from './lib'

const GERMAN: Record<FindingCode, (a: Record<string, string>) => string> = {
  'predicate-unreadable': (a) => `Modell ${a.model}: Prädikat nicht auswertbar, gilt als leer — ${a.error}`,
  'param-unreadable': (a) => `Modell ${a.model}: Parameter "${a.param}" nicht auswertbar, gilt als leer — ${a.error}`,
  'param-unread': (a) => `Modell ${a.model}: "${a.behaviour}" liest den Parameter "${a.param}" nicht`,
  'behaviour-unknown': (a) => `Modell ${a.model}: unbekanntes Behaviour "${a.behaviour}", als inline ausgegeben`,
  'behaviour-missing': (a) => `Modell ${a.model}: kein @behaviour, als inline ausgegeben`,
  'css-class-missing': (a) => `Modell ${a.model}: ein gestaltetes Modell unter mehreren braucht @cssClass, gestaltet als .${a.model}`,
  'model-unreachable': (a) => `Modell ${a.model}: nie erreichbar, ${a.by} entscheidet schon`,
  'model-unreachable-group': (a) => `Modell ${a.model}: nie erreichbar, die Gruppe ab ${a.by} entscheidet schon`,
  'css-property-undefined': (a) => `CSS: ${a.property} ist nirgends definiert`,
  'chain-not-followed': (a) => `schemaSpec "${a.ident}": @source "${a.source}" wird nicht verfolgt, die ODD muss zuerst aufgelöst werden`,
  'schema-spec-ignored': (a) => `schemaSpec "${a.ident}" bleibt unbeachtet: nur die erste wird gelesen`,
  'element-absent': (a) => `<${a.element}>: im Korpus nicht vorgekommen, ${a.count} Modell(e) ungenutzt`,
  'model-unused': (a) => `Modell ${a.model}: greift nie`,
  'element-no-match': (a) => `<${a.element}>: Modelle vorhanden, keines trifft zu`,
  'element-no-model': (a) => `<${a.element}>: kein Modell in der ODD`,
  'value-not-listed': (a) => `Wert nicht in der Werteliste der ODD: ${a.element}/@${a.attribute}="${a.value}"`,
  'rendition-undeclared': (a) => `Rendition nicht in der ODD deklariert: #${a.rendition}`,
  'range-no-start': (a) => `Kommentierter Bereich ohne Anfangspunkt: ${a.ids}`,
  'anchor-unused': (a) => `Anker, auf den keine Anmerkung zeigt: ${a.ids}`,
  'region-unpaired': (a) => `Bereichsmarke ohne Gegenstück (${a.count}×)`,
  'id-twice': (a) => `xml:id zweimal vergeben, Verweise landen an der falschen Stelle: ${a.id}`,
  'id-invalid': (a) => `xml:id ist kein NCName, XML-Werkzeuge lehnen die Datei ab: ${a.id}`,
}

export const inGerman = ({ code, args }: Finding): string => GERMAN[code](args)
