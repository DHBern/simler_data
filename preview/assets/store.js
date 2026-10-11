/**
 * What a reader chose, kept across pages. The one thing `preview.js` and
 * `synopsis.js` share, so it is its own file rather than a copy in each; both
 * load it first. Storage can throw (`file://`, blocked site data), and a
 * setting that cannot be kept is not a reason for the page to fail.
 */
var previewStore = {
  get: function (key) {
    try { return localStorage.getItem('simler-preview:' + key) } catch (e) { return null }
  },
  set: function (key, value) {
    try { localStorage.setItem('simler-preview:' + key, value) } catch (e) { /* ignored */ }
  },
}
