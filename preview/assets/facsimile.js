/**
 * The facsimile drawer.
 *
 * Text and viewer follow each other: the page whose `<pb/>` last crossed the
 * reading line is the page in the viewer, and paging the viewer, or clicking a
 * `<pb/>`, scrolls the text to that `<pb/>`. Whether the drawer is open, and how
 * wide, outlasts the page.
 */
;(function () {
  'use strict'

  var root = document.documentElement
  var panel = document.getElementById('facsimile')
  var island = panel && panel.querySelector('script[data-facs-data]')
  if (!island) return

  var data = JSON.parse(island.textContent || '{}')
  var pages = data.pages || []
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
    var label = marks[i] ? marks[i].getAttribute('data-n') || '' : ''
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

  // ── Open, closed, how wide: `data-facs` and `--facs-w` on <html> ─────────

  var load = function (key) { try { return localStorage.getItem('simler-preview:' + key) } catch (e) { return null } }
  var save = function (key, value) { try { localStorage.setItem('simler-preview:' + key, value) } catch (e) { /* file:// */ } }

  function update() {
    // Closed, or too narrow a window (preview.css): no box to boot the viewer into.
    if (window.getComputedStyle(frame).display === 'none') {
      window.removeEventListener('scroll', sync)
      return
    }
    handle.setAttribute('aria-valuenow', String(Math.round(panel.offsetWidth / window.innerWidth * 100)))
    window.addEventListener('scroll', sync, { passive: true })
    show(atReadingLine())
    boot()
  }

  function open(value) {
    root.setAttribute('data-facs', value)
    update()
  }

  /** The stylesheet bounds the width; what is kept is what it allowed. */
  function widen(px) {
    root.style.setProperty('--facs-w', px + 'px')
    save('facs-w', panel.offsetWidth)
    update()
  }

  panel.addEventListener('click', function (event) {
    var button = event.target.closest('[data-facs-toggle]')
    if (!button) return
    open(button.dataset.facsToggle)
    save('facs-open', button.dataset.facsToggle)
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

  // A page break in the text opens the drawer at its page.
  function turnTo(mark) {
    open('on')
    save('facs-open', 'on')
    if (window.getComputedStyle(frame).display === 'none') return
    window.scrollTo(0, window.scrollY + mark.getBoundingClientRect().top - window.innerHeight * 0.2)
    driven = window.scrollY
    show(marks.indexOf(mark))
  }
  marks.forEach(function (mark) {
    if (!mark) return
    mark.tabIndex = 0
    mark.setAttribute('role', 'button')
    mark.title = 'Seite im Faksimile zeigen'
    mark.addEventListener('click', function () { turnTo(mark) })
    mark.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      turnTo(mark)
    })
  })

  if (load('facs-w')) root.style.setProperty('--facs-w', load('facs-w') + 'px')
  open(load('facs-open') || 'on')
  window.addEventListener('resize', update)
})()
