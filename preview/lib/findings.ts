/**
 * What the package reports: a code to act on, the values it is about, and a message
 * in English. A consumer that reports in another language formats `code` and `args`.
 */

type Args = Record<string, string>

const MESSAGES = {
  // The ODD itself.
  'predicate-unreadable': (a) => `Model ${a.model}: predicate cannot be evaluated, counts as empty — ${a.error}`,
  'param-unreadable': (a) => `Model ${a.model}: param "${a.param}" cannot be evaluated, counts as empty — ${a.error}`,
  'param-unread': (a) => `Model ${a.model}: "${a.behaviour}" does not read the param "${a.param}"`,
  'behaviour-unknown': (a) => `Model ${a.model}: unknown behaviour "${a.behaviour}", renders as inline`,
  'behaviour-missing': (a) => `Model ${a.model}: no @behaviour, renders as inline`,
  'css-class-missing': (a) => `Model ${a.model}: a styled model among several needs @cssClass, styled as .${a.model}`,
  'model-unreachable': (a) => `Model ${a.model}: never reached, ${a.by} already decides`,
  'model-unreachable-group': (a) => `Model ${a.model}: never reached, the group from ${a.by} already decides`,
  'css-property-undefined': (a) => `CSS: ${a.property} is not defined anywhere`,
  'chain-not-followed': (a) => `schemaSpec "${a.ident}": @source "${a.source}" is not followed, the ODD must be flattened first`,
  'schema-spec-ignored': (a) => `schemaSpec "${a.ident}" is ignored: only the first one is read`,
  // The ODD against what was rendered.
  'element-absent': (a) => `<${a.element}>: not in the corpus, ${a.count} model(s) unused`,
  'model-unused': (a) => `Model ${a.model}: never fires`,
  'element-no-match': (a) => `<${a.element}>: has models, none applies`,
  'element-no-model': (a) => `<${a.element}>: no model in the ODD`,
  // A document.
  'value-not-listed': (a) => `Value not in the ODD's list: ${a.element}/@${a.attribute}="${a.value}"`,
  'rendition-undeclared': (a) => `Rendition not declared in the ODD: #${a.rendition}`,
  'range-no-start': (a) => `Commented range without a start: ${a.ids}`,
  'anchor-unused': (a) => `Anchor no note points to: ${a.ids}`,
  'region-unpaired': (a) => `Region marker without a partner (${a.count}×)`,
  'id-twice': (a) => `xml:id used twice, links land in the wrong place: ${a.id}`,
  'id-invalid': (a) => `xml:id is no NCName, XML tools refuse the file: ${a.id}`,
} satisfies Record<string, (args: Args) => string>

export type FindingCode = keyof typeof MESSAGES

export interface Finding {
  code: FindingCode
  args: Args
  message: string
}

export const finding = (code: FindingCode, args: Args = {}): Finding => ({ code, args, message: MESSAGES[code](args) })
