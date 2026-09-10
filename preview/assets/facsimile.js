/**
 * The facsimile rail.
 *
 * Text and viewer follow each other: the page whose `<pb/>` last crossed the
 * reading line is the page in the viewer, and paging the viewer scrolls the text
 * to that `<pb/>`.
 */
;(function () {
  'use strict'

  var root = document.documentElement
  var panel = document.getElementById('facsimile')
  var island = panel && panel.querySelector('script[data-facs-data]')
  if (!island) return

  var data = JSON.parse(island.textContent || '{}')
  var pages = data.pages || []
  var image = panel.querySelector('[data-facs-image]')
  var mount = panel.querySelector('[data-facs-mount]')
  var tools = panel.querySelector('[data-facs-tools]')
  var caption = panel.querySelector('[data-facs-label]')
  var link = panel.querySelector('[data-facs-link]')
  // The scroll anchors the pb handler already emits.
  var marks = pages.map(function (facs) { return document.getElementById('pb-' + facs) })

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
    // The page name the text itself prints — `[A vij r]`, `194`; the marker sets
    // a bare dot where the print numbers nothing, and that is not a name.
    var label = marks[i] ? (marks[i].textContent || '').trim() : ''
    if (label === '·') label = ''
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
    var line = window.innerHeight * 0.35
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
      if (window.scrollY !== driven) show(atReadingLine())
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

  // ── On and off ───────────────────────────────────────────────────────────
  // The switch is `data-facs` on <html>, owned by `preview.js`. Watching the
  // attribute keeps the two apart: the rail costs nothing while it is off.

  function update() {
    // Narrower than the rail's breakpoint the panel is not shown at all, and the
    // viewer must not boot into a box with no size (preview.css).
    var on = root.getAttribute('data-facs') === 'on' &&
      window.getComputedStyle(panel).display !== 'none'
    if (!on) {
      window.removeEventListener('scroll', sync)
      return
    }
    window.addEventListener('scroll', sync, { passive: true })
    show(atReadingLine())
    boot()
  }

  new MutationObserver(update).observe(root, { attributeFilter: ['data-facs'] })
  window.addEventListener('resize', update)
  update()
})()
