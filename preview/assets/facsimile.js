/**
 * The drawer beside the text: the facsimile, or the XML.
 *
 * Both follow the text. The page whose `<pb/>` last crossed the reading line is
 * the page in the viewer, and paging the viewer, or clicking a `<pb/>`, scrolls
 * the text to that `<pb/>`. The XML stands at the reading line's place in the
 * source, between the lines of the page breaks and poems around it, and its
 * line numbers scroll the text there. Whether the drawer is open, how wide, and
 * which view it shows, outlasts the page.
 */
;(function () {
  'use strict'

  var root = document.documentElement
  var panel = document.getElementById('facsimile')
  if (!panel) return
  var island = function (scope, name) {
    var script = scope.querySelector('script[data-' + name + ']')
    return script && JSON.parse(script.textContent)
  }
  var data = island(panel, 'facs-data') || { pages: [] }
  var at = island(document, 'source')
  var pages = data.pages
  var frame = panel.querySelector('.facs-frame')
  var image = panel.querySelector('[data-facs-image]')
  var mount = panel.querySelector('[data-facs-mount]')
  var handle = panel.querySelector('[data-facs-resize]')
  var tools = panel.querySelector('[data-facs-tools]')
  var caption = panel.querySelector('[data-facs-label]')
  var link = panel.querySelector('[data-facs-link]')
  // The page breaks in the text, found by the image they name.
  var marks = pages.map(function (facs) {
    return document.querySelector('[data-page="' + CSS.escape(facs) + '"]')
  })
  var READING = 0.35 // the reading line, as a share of the window's height
  var shown = function (el) { return !!el && el.getClientRects().length > 0 }

  var base = function (facs) { return data.root + '/' + encodeURIComponent(facs) }

  var viewer = null
  var loading = false
  var index = -1
  var timer = 0
  var driven = null // the scroll position the viewer set, not to be synced back

  /** Show page `i`: the caption at once, the image once the reader settles. */
  function show(i) {
    if (i === index || !pages[i]) return
    index = i
    // The page name the print gives: `[A vij r]`, `194`.
    // The break's label, without the source link `preview.js` puts at its end.
    var link = marks[i] && marks[i].querySelector('.page-source-link')
    var label = marks[i] ? marks[i].textContent.slice(0, link ? -link.textContent.length : undefined).trim() : ''
    caption.textContent = (label ? label + ' · ' : '') + 'Bild ' + (i + 1) + ' von ' + pages.length
    if (link) link.href = data.library + '/' + encodeURIComponent(pages[i])
    // Scrolling crosses many pages; only the one the reader stops on is fetched.
    clearTimeout(timer)
    timer = setTimeout(function () {
      if (viewer) {
        if (viewer.currentPage() !== i) viewer.goToPage(i)
      } else if (image) {
        image.src = base(pages[i]) + '/full/800,/0/default.jpg'
      }
    }, 250)
  }

  // ── Where the reader is ──────────────────────────────────────────────────
  // The last page break above the reading line. The marks are in document
  // order, so the scan stops at the first one below it.

  function atReadingLine() {
    var line = window.innerHeight * READING
    var at = 0
    for (var i = 0; i < marks.length; i++) {
      if (!marks[i]) continue
      if (marks[i].getBoundingClientRect().top > line) break
      at = i
    }
    return at
  }

  var queued = false
  function sync() {
    if (queued) return
    queued = true
    requestAnimationFrame(function () {
      queued = false
      if (root.getAttribute('data-facs-view') === 'xml') follow()
      else if (window.scrollY !== driven) show(atReadingLine())
    })
  }

  // ── The viewer ───────────────────────────────────────────────────────────

  function boot() {
    if (viewer || loading) return
    loading = true
    var script = document.createElement('script')
    script.src = 'assets/vendor/openseadragon.min.js'
    script.onload = start
    script.onerror = function () { loading = false } // the still image stays
    document.head.appendChild(script)
  }

  function start() {
    // `$.Button` overwrites each button's `title` from OpenSeadragon's own
    // string table, so the German labels have to be set there.
    var labels = {
      'Tooltips.ZoomIn': 'Vergrössern',
      'Tooltips.ZoomOut': 'Verkleinern',
      'Tooltips.Home': 'Ganze Seite',
      'Tooltips.FullPage': 'Vollbild',
      'Tooltips.PreviousPage': 'Vorherige Seite',
      'Tooltips.NextPage': 'Nächste Seite',
    }
    Object.keys(labels).forEach(function (key) { OpenSeadragon.setString(key, labels[key]) })
    var control = function (id) { return document.getElementById(id) || undefined }

    viewer = OpenSeadragon({
      element: mount,
      tileSources: pages.map(function (facs) { return base(facs) + '/info.json' }),
      sequenceMode: pages.length > 1,
      initialPage: Math.max(index, 0),
      showNavigator: false,
      showRotationControl: false,
      showSequenceControl: pages.length > 1,
      // Our own buttons: OpenSeadragon's are PNG sprites resolved against
      // `prefixUrl`, which nothing here ships.
      zoomInButton: control('osd-zoom-in'),
      zoomOutButton: control('osd-zoom-out'),
      homeButton: control('osd-home'),
      fullPageButton: control('osd-full'),
      previousButton: control('osd-prev'),
      nextButton: control('osd-next'),
      gestureSettingsMouse: { clickToZoom: false },
      crossOriginPolicy: 'Anonymous',
      maxZoomPixelRatio: 2,
      imageLoaderLimit: 4, // the default is unlimited: a burst of tiles at e-rara
    })

    // The buttons move inside the element that goes fullscreen, or they would be
    // gone in full-page mode. `$.Button` also forces `display: inline-block` as
    // an inline style, which would beat the stylesheet.
    mount.appendChild(tools)
    tools.classList.add('osd-toolbar-overlay')
    tools.hidden = false
    tools.querySelectorAll('button').forEach(function (button) {
      button.style.display = 'inline-flex'
    })

    // Only once tiles are up is the still image redundant.
    viewer.addOnceHandler('open', function () { panel.dataset.facsReady = '' })
    // Paging by hand brings the text along. A page our own `goToPage` opened is
    // already `index`, which closes the loop.
    viewer.addHandler('page', function (event) {
      if (event.page === index) return
      show(event.page)
      var mark = marks[event.page]
      if (!mark) return
      window.scrollTo(0, window.scrollY + mark.getBoundingClientRect().top - window.innerHeight * 0.2)
      driven = window.scrollY
    })
  }

  // ── The XML ──────────────────────────────────────────────────────────────
  // The page breaks and poems with a line in the source, in document order, so
  // in the order of their lines; the text between two of them stands for the
  // lines between theirs, in proportion.

  var xml = null
  var ready = false
  var xmlView = panel.querySelector('[data-xml-view]')
  var xmlLabel = panel.querySelector('[data-xml-label]')
  var xmlLink = panel.querySelector('[data-xml-link]')
  var lines = function (el) { return (el.dataset.page && at.pages[el.dataset.page]) || at.ids[el.id] }
  var anchors = at ? Array.prototype.filter.call(document.querySelectorAll('main [id], main [data-page]'), lines) : []
  var page = function (n) { return 'source.html?' + encodeURIComponent(at.file) + '#L' + n }

  /** The last anchor at or above `y`, by its top in the window, or -1. */
  function anchorAt(y) {
    var lo = 0, hi = anchors.length - 1, found = -1
    while (lo <= hi) {
      var mid = (lo + hi) >> 1
      if (anchors[mid].getBoundingClientRect().top <= y) { found = mid; lo = mid + 1 } else hi = mid - 1
    }
    return found
  }

  /** Between anchors `i` and `i + 1`, the source line `n` at `y`, or with `n`, the `y` of that line. */
  function between(i, y, n) {
    var a = anchors[i], b = anchors[i + 1]
    var la = lines(a)[0], lb = b ? lines(b)[0] : la
    var ya = a.getBoundingClientRect().top, yb = b ? b.getBoundingClientRect().top : ya
    if (n === undefined) return la + (lb > la && yb > ya ? Math.min(1, (y - ya) / (yb - ya)) * (lb - la) : 0)
    return ya + (lb > la ? (n - la) / (lb - la) * (yb - ya) : 0)
  }

  /** The XML at the reading line, and the poem standing there marked. */
  function follow() {
    if (!ready) return
    var y = window.innerHeight * READING
    var i = anchorAt(y)
    var n = i < 0 ? 1 : between(i, y)
    var poem = null
    for (var k = i; k >= 0 && !poem; k--) if (at.ids[anchors[k].id]) poem = anchors[k]
    var range = poem && poem.getBoundingClientRect().bottom >= y ? at.ids[poem.id] : [0, 0]
    xml.show(n, READING)
    xml.mark(range[0], range[1])
    xmlLabel.textContent = at.file + ' · Zeile ' + Math.round(n)
    xmlLink.href = page(range[0] ? range[0] + (range[1] > range[0] ? '-L' + range[1] : '') : Math.round(n))
  }

  function loadXml() {
    if (xml) return follow()
    xml = window.SourceView(xmlView, panel.querySelector('[data-xml-frame]'), page)
    xml.load(at.file, function () { ready = true; follow() })
  }

  // A line number scrolls the text to that line's place; with a modifier it opens the source page.
  if (xmlView) xmlView.addEventListener('click', function (event) {
    var no = event.target.closest('.source-no')
    if (!no || event.ctrlKey || event.metaKey || event.shiftKey || !anchors.length) return
    event.preventDefault()
    var n = Number(no.textContent)
    var i = 0
    while (i + 1 < anchors.length && lines(anchors[i + 1])[0] <= n) i++
    window.scrollBy(0, between(i, 0, n) - window.innerHeight * READING)
  })

  // ── Open, closed, how wide, which view: `data-facs`, `--facs-w` and `data-facs-view` on <html> ──

  var load = function (key) { try { return localStorage.getItem('simler-preview:' + key) } catch (e) { return null } }
  var save = function (key, value) { try { localStorage.setItem('simler-preview:' + key, value) } catch (e) { /* file:// */ } }

  function update() {
    // Closed, or too narrow a window (preview.css): nothing to follow.
    if (root.getAttribute('data-facs') !== 'on' || !shown(panel)) {
      window.removeEventListener('scroll', sync)
      return
    }
    handle.setAttribute('aria-valuenow', String(Math.round(panel.offsetWidth / window.innerWidth * 100)))
    window.addEventListener('scroll', sync, { passive: true })
    if (root.getAttribute('data-facs-view') === 'xml') return loadXml()
    show(atReadingLine())
    boot()
  }

  function open(value) {
    root.setAttribute('data-facs', value)
    save('facs-open', value)
    update()
  }

  /** `facs` or `xml`, where the document has it. */
  function view(value) {
    if (!(value === 'facs' ? pages.length : value === 'xml' && at)) return
    root.setAttribute('data-facs-view', value)
    panel.querySelectorAll('[data-facs-show]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.facsShow === value))
    })
  }

  /** The stylesheet bounds the width; what is kept is what it allowed. */
  function widen(px) {
    root.style.setProperty('--facs-w', px + 'px')
    save('facs-w', panel.offsetWidth)
    update()
  }

  panel.addEventListener('click', function (event) {
    var to = event.target.closest('[data-facs-show]')
    if (to) {
      view(to.dataset.facsShow)
      save('facs-view', to.dataset.facsShow)
      return update()
    }
    var button = event.target.closest('[data-facs-toggle]')
    if (!button) return
    open(button.dataset.facsToggle)
    // The clicked button is hidden now; focus moves to its counterpart.
    panel.querySelector('[data-facs-toggle]:not([data-facs-toggle="' + button.dataset.facsToggle + '"])').focus()
  })

  handle.addEventListener('pointerdown', function (event) {
    event.preventDefault()
    handle.setPointerCapture(event.pointerId)
  })
  handle.addEventListener('pointermove', function (event) {
    if (handle.hasPointerCapture(event.pointerId)) widen(window.innerWidth - event.clientX)
  })
  handle.addEventListener('keydown', function (event) {
    var step = { ArrowLeft: 32, ArrowRight: -32 }[event.key]
    if (step) widen(panel.offsetWidth + step)
  })

  /** Open the drawer in `value`, with `el` at the reading line (facsimile: a little above). */
  function bring(value, el) {
    view(value)
    save('facs-view', value)
    open('on')
    window.scrollBy(0, el.getBoundingClientRect().top - window.innerHeight * (value === 'xml' ? READING : 0.2))
    driven = window.scrollY
    if (value === 'xml') loadXml()
    else show(marks.indexOf(el))
  }

  // A page break in the text opens the drawer at its page.
  marks.forEach(function (mark) {
    if (!mark) return
    mark.tabIndex = 0
    mark.setAttribute('role', 'button')
    mark.title = 'Seite im Faksimile zeigen'
    mark.addEventListener('click', function (event) {
      if (!event.target.closest('a') && shown(panel)) bring('facs', mark) // not its *XML* link
    })
    mark.addEventListener('keydown', function (event) {
      if (event.target !== mark || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      if (shown(panel)) bring('facs', mark)
    })
  })

  // An *XML* link opens the XML here, where the window has room for the drawer; elsewhere its own page.
  document.addEventListener('click', function (event) {
    var to = at && event.target.closest('.source-link, .page-source-link')
    if (!to || event.ctrlKey || event.metaKey || event.shiftKey || !shown(panel)) return
    event.preventDefault()
    bring('xml', to.parentNode)
  })

  if (load('facs-w')) root.style.setProperty('--facs-w', load('facs-w') + 'px')
  view(load('facs-view') || root.getAttribute('data-facs-view'))
  root.setAttribute('data-facs', load('facs-open') || root.getAttribute('data-facs'))
  update()
  window.addEventListener('resize', update)
})()
