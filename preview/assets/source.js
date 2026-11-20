/**
 * A TEI file's lines, numbered and highlighted: `SourceView` draws them into an
 * element, for the source page (`source.html?A_1648.xml#L12-L80`, those lines
 * marked) and the XML view of a document's drawer.
 *
 * The file comes as `sources/<file>.js`, a script, so it loads from `file://`
 * too. Only the lines in view are drawn, so a file of 45,000 lines costs no
 * more than one of 400; the highlighting needs each line's state at its start,
 * found in one pass when the file arrives.
 */
;(function () {
  'use strict'

  var LINE = 20 // px, as `.source-line` sets it
  var BUFFER = 30 // lines drawn above and below the window

  // ── Highlighting: a small tokenizer, line by line, carrying its state over ──
  var TEXT = 0, TAG = 1, DQ = 2, SQ = 3, COMMENT = 4, DECL = 5
  var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  var NAME = /<\/?[^\s/>]*/y, ATTR = /[^\s=/>"']+/y, SPACE = /[\s=]+/y

  /** The state after `s`, begun in `state`; with `out`, its HTML pushed there. */
  function scan(s, state, out) {
    var i = 0
    var put = function (cls, j) {
      if (out && j > i) out.push(cls ? '<span class="x-' + cls + '">' + esc(s.slice(i, j)) + '</span>' : esc(s.slice(i, j)))
      i = j
    }
    var upTo = function (cls, end, then) {
      var j = s.indexOf(end, i)
      if (j < 0) { put(cls, s.length); return state }
      put(cls, j + end.length)
      return then
    }
    var sticky = function (re) { re.lastIndex = i; return re.test(s) ? re.lastIndex : i }
    while (i < s.length) {
      if (state === COMMENT) state = upTo('com', '-->', TEXT)
      else if (state === DECL) state = upTo('decl', '>', TEXT)
      else if (state === DQ) state = upTo('val', '"', TAG)
      else if (state === SQ) state = upTo('val', "'", TAG)
      else if (state === TAG) {
        var c = s[i]
        if (c === '>') { put('tag', i + 1); state = TEXT }
        else if (c === '/' && s[i + 1] === '>') { put('tag', i + 2); state = TEXT }
        else if (c === '"' || c === "'") {
          var close = s.indexOf(c, i + 1)
          if (close >= 0) put('val', close + 1)
          else { put('val', s.length); state = c === '"' ? DQ : SQ } // a value that goes on in the next line
        }
        else if (sticky(SPACE) > i) put('', SPACE.lastIndex)
        else put('attr', Math.max(sticky(ATTR), i + 1))
      } else {
        var lt = s.indexOf('<', i)
        var end = lt < 0 ? s.length : lt
        // Entities stand out in the text.
        for (var amp = s.indexOf('&', i); amp >= 0 && amp < end; amp = s.indexOf('&', i)) {
          var semi = s.indexOf(';', amp)
          if (semi < 0 || semi > end) break
          put('', amp)
          put('ent', semi + 1)
        }
        put('', end)
        if (lt < 0) break
        if (s.startsWith('<!--', i)) { put('com', i + 4); state = COMMENT }
        else if (s[i + 1] === '?' || s[i + 1] === '!') { put('decl', i + 2); state = DECL }
        else { put('tag', Math.max(sticky(NAME), i + 1)); state = TAG }
      }
    }
    return state
  }

  // ── The view ──────────────────────────────────────────────────────────────

  /** `view` holds the lines, `scroller` (an element, or `window`) scrolls them; `href(n)` links line n's number. */
  window.SourceView = function (view, scroller, href) {
    var lines = []
    var states = []
    var marked = [0, 0]
    var drawn = ''
    var box = function () { return scroller === window ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect() }

    function draw() {
      var b = box()
      var top = view.getBoundingClientRect().top
      var first = Math.max(0, Math.floor((b.top - top) / LINE) - BUFFER)
      var last = Math.min(lines.length, Math.ceil((b.bottom - top) / LINE) + BUFFER)
      var key = first + ':' + last + ':' + marked
      if (key === drawn) return
      drawn = key
      var html = []
      for (var k = first; k < last; k++) {
        var n = k + 1
        html.push('<div class="source-line' + (n >= marked[0] && n <= marked[1] ? ' is-marked' : '') +
          '" style="top:' + k * LINE + 'px"><a class="source-no" href="' + esc(href(n)) + '">' + n + '</a><code>')
        scan(lines[k], states[k], html)
        html.push('</code></div>')
      }
      view.innerHTML = html.join('')
    }

    return {
      /** Fetch `file`, then call `then`. */
      load: function (file, then) {
        window.previewSource = function (text) {
          lines = text.split(/\r?\n/)
          var state = TEXT
          var widest = 0
          for (var k = 0; k < lines.length; k++) {
            states.push(state)
            state = scan(lines[k], state, null)
            widest = Math.max(widest, lines[k].length)
          }
          view.style.height = lines.length * LINE + 'px'
          view.style.setProperty('--widest', widest + 'ch')
          view.textContent = ''
          var frame = 0
          scroller.addEventListener('scroll', function () {
            if (!frame) frame = requestAnimationFrame(function () { frame = 0; draw() })
          }, { passive: true })
          window.addEventListener('resize', draw)
          then()
        }
        var script = document.createElement('script')
        script.src = 'sources/' + encodeURIComponent(file) + '.js'
        script.onerror = function () { view.textContent = 'Quelldatei nicht gefunden: ' + file }
        document.body.append(script)
      },
      /** Lines `a` to `b` marked; none for 0. */
      mark: function (a, b) {
        marked = [a, b]
        drawn = ''
        draw()
      },
      /** Line `n`, which may be fractional, at `at` (0 to 1) of the visible height. */
      show: function (n, at) {
        var b = box()
        scroller.scrollBy(0, view.getBoundingClientRect().top + (n - 1) * LINE - b.top - at * (b.bottom - b.top))
        draw()
      },
    }
  }

  // ── The source page ───────────────────────────────────────────────────────
  var page = document.getElementById('source')
  if (!page) return
  var github = document.querySelector('[data-source-github]')
  var file = decodeURIComponent(location.search.slice(1))
  if (!/^[\w.-]+\.xml$/.test(file)) {
    page.textContent = 'Keine Quelldatei angegeben.'
    return
  }
  document.querySelector('.bar-title').textContent = file
  document.title = file + ' · Simler-Vorschau'
  var view = window.SourceView(page, window, function (n) { return '#L' + n })

  /** `#L12` or `#L12-L80`: those lines marked, the first a little below the top. */
  function go() {
    var m = /^#L(\d+)(?:-L(\d+))?$/.exec(location.hash)
    if (github) github.href = github.dataset.sourceGithub + file + (m ? location.hash : '')
    if (m) view.show(Number(m[1]) - 3, 0)
    view.mark(m ? Number(m[1]) : 0, m ? Number(m[2] || m[1]) : 0)
  }
  view.load(file, function () {
    window.addEventListener('hashchange', go)
    go()
  })
})()
