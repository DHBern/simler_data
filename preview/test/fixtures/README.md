# Conformance fixtures

One ODD, four TEI cases, and what this preview renders from them. `npm test`
checks each case against `<case>.html` (the page, and below it the notes it
collects for the apparatus) and `<case>.txt` (the ODD's `plain` output, which is
what the search indexes). `UPDATE_FIXTURES=1 npm test` rewrites the expected
files, so an intended change is reviewed as a diff.

## Where they come from

`pm.odd` and `tei/*.xml` are the conformance fixtures of
[odd-rendering-compiler](https://github.com/cforney/odd-rendering-compiler)
(`compiler-js/test/fixtures/`, BSD-2-Clause), which compiles the same kind of ODD
into XSLT, unified handlers and CETEIcean behaviours. They were written to cover
the Processing Model one feature at a time, not this corpus, which is what makes
them worth borrowing: they exercise models this edition's ODD never reaches.

| Case | What it covers |
| --- | --- |
| `structure` | a spec's only model; a model group with an inherited source rendition; `@cssClass`; document order (the first model wins, the next predicate is never asked); a `modelSequence` with the id on its first part; a block inside phrasing content |
| `outputs` | `@output`: an output's models take precedence there, a view laid over the page (`omit`, added classes, the readings of an `alternate`), and a model marked `web` |
| `params` | params as CSS custom properties and as attributes; node-valued params, including one that selects the element itself; predicates with positions, value comparisons and conditionals; breaks, labels, and the hyphen at a joined line end; `link` and `graphic` |
| `notes` | notes numbered in document order, the outer before the one inside it; a note in the margin, collected without a marker; a commented range closed by `@targetEnd` |

**Kept up to date by hand.** The files are a copy, not a submodule; refresh them
from that repository when its suite grows, and re-read the differences below.

## What was changed, and why

The ODD is verbatim apart from three additions, each of which is a difference in
what the two implementations accept:

* **`elementSpec`s for `TEI`, `text`, `body`, `sic` and `corr`.** An element with
  no model passes its content through in the compiler; here it is reported and
  rendered as a plain span, so the ODD has to cover every element it renders.
* **`@cssClass` on the second `head` model.** A styled model among others must
  name its class here, where the compiler falls back to a positional one
  (`head-2`, the name used here, so that the two agree anyway).

## Where the two renderings differ

The expected files are this preview's, not the compiler's, because four
conventions differ. None of them is in the ODD; all of them would have to be
settled before the two projects could share expected output as well as input.

| | This preview | The compiler |
| --- | --- | --- |
| The source's attributes | mirrored as `data-*` (`@rend` → `data-rend`) | not mirrored |
| An `alternate`'s readings | `pm-alt` with `pm-default` / `pm-alternate`, one class per view | `tei-alternate-default` / `tei-alternate-alt`, the second `hidden` |
| Notes | collected, and placed by the page; the marker carries `data-note` and its range | rendered into the page as a `tei-footnotes` section |
| Around the text | the page is `page.ts`'s | a `tei-edition` wrapper with the view switches |
