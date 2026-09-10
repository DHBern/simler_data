/**
 * The preview's behaviour: the switches, and the two anchored panels.
 *
 * A classic script, not a module: an editor opening `dist/A_1648.html` from a
 * checkout is on `file://`, where the browser refuses modules. The page is
 * fully readable without any of this.
 */
;(function () {
  'use strict'

  var root = document.documentElement

  // ── Reading switches ─────────────────────────────────────────────────────
  // Each `[data-switch]` group drives one attribute on <html>; the stylesheet
  // does the rest. The choice is kept across documents.

  var store = {
    get: function (key) {
      try { return localStorage.getItem('simler-preview:' + key) } catch (e) { return null }
    },
    set: function (key, value) {
      try { localStorage.setItem('simler-preview:' + key, value) } catch (e) { /* file:// */ }
    },
  }

  function apply(group, value) {
    root.setAttribute('data-' + group.dataset.switch, value)
    group.querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.value === value))
    })
  }

  document.querySelectorAll('[data-switch]').forEach(function (group) {
    var saved = store.get(group.dataset.switch)
    if (saved) apply(group, saved)

    group.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-value]')
      if (!button) return
      apply(group, button.dataset.value)
      store.set(group.dataset.switch, button.dataset.value)
    })
  })

  // ── One anchored panel, two users ────────────────────────────────────────
  // The note tooltip and the entity card differ only in what they put in the
  // panel, so anchoring, dismissal and focus live here once. Click, never
  // hover: a panel that vanishes when the pointer leaves the trigger is a panel
  // whose links cannot be reached.

  var MARGIN = 8

  /** `fill` returns false to decline — the click is then not intercepted. */
  function createPopover(panel, selector, fill) {
    // Safari < 17 has no popover API: a plain `hidden` toggle, so no top layer
    // and no light dismiss, but the panel still opens, reads and closes.
    var native = typeof panel.showPopover === 'function'
    if (!native) panel.hidden = true
    var active = null

    var isOpen = function () { return native ? panel.matches(':popover-open') : !panel.hidden }

    /** Below the trigger, flipped above where there is no room, never off an edge. */
    function place(trigger) {
      var box = trigger.getBoundingClientRect()
      var below = box.bottom + MARGIN
      var above = box.top - panel.offsetHeight - MARGIN
      var top = below + panel.offsetHeight <= window.innerHeight || above < 0 ? below : above
      panel.style.position = 'fixed'
      panel.style.margin = '0'
      panel.style.top =
        Math.max(MARGIN, Math.min(top, window.innerHeight - panel.offsetHeight - MARGIN)) + 'px'
      panel.style.left =
        Math.min(
          Math.max(MARGIN, box.left),
          Math.max(MARGIN, window.innerWidth - panel.offsetWidth - MARGIN)
        ) + 'px'
    }

    function open(trigger) {
      if (!fill(trigger)) return false
      if (active && active !== trigger) active.setAttribute('aria-expanded', 'false')
      active = trigger
      if (native) { if (!isOpen()) panel.showPopover() } else { panel.hidden = false }
      place(trigger)
      trigger.setAttribute('aria-expanded', 'true')
      panel.focus({ preventScroll: true })
      return true
    }

    function close() {
      if (native) { if (isOpen()) panel.hidePopover() } else { panel.hidden = true }
      if (active) active.setAttribute('aria-expanded', 'false')
      active = null
    }

    document.addEventListener('click', function (event) {
      var target = event.target
      if (!target.closest) return
      if (panel.contains(target)) {
        if (target.closest('[data-popover-close]')) close()
        return
      }
      var trigger = target.closest(selector)
      if (trigger && open(trigger)) event.preventDefault()
    })

    // An open panel follows its trigger while the reader scrolls past.
    var follow = function () { if (active && isOpen()) place(active) }
    window.addEventListener('scroll', follow, { passive: true })
    window.addEventListener('resize', follow)
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close() })
    // Light dismiss bypasses `close()`, so the trigger is reset here too.
    panel.addEventListener('toggle', function (e) {
      if (e.newState === 'closed' && active) {
        active.setAttribute('aria-expanded', 'false')
        active = null
      }
    })

    return { open: open, current: function () { return active } }
  }

  // ── The Stellenkommentar tooltip ─────────────────────────────────────────

  var notePanel = document.getElementById('note-popover')
  var markers = [].slice.call(document.querySelectorAll('a.note-marker[data-note]'))
  if (notePanel && markers.length) {
    var title = notePanel.querySelector('[data-note-title]')
    var body = notePanel.querySelector('[data-note-body]')
    var jump = notePanel.querySelector('[data-note-jump]')

    var notes = createPopover(notePanel, 'a.note-marker[data-note]', function (marker) {
      var note = document.getElementById(marker.dataset.note)
      var source = note && note.querySelector('.endnote-body')
      if (!source) return false // no endnote to read from: leave the marker its link
      var at = markers.indexOf(marker)
      title.textContent =
        'Anmerkung ' + (marker.textContent || '').trim() +
        (markers.length > 1 ? ' von ' + markers.length : '')
      body.replaceChildren.apply(body, source.cloneNode(true).childNodes)
      jump.href = '#' + marker.dataset.note
      notePanel.querySelectorAll('[data-note-step]').forEach(function (button) {
        var to = at + Number(button.dataset.noteStep)
        button.disabled = to < 0 || to >= markers.length
        button.hidden = markers.length < 2
      })
      return true
    })

    notePanel.addEventListener('click', function (event) {
      var step = event.target.closest('[data-note-step]')
      var current = notes.current()
      if (!step || !current) return
      // Bring the marker into view first: the panel is placed against it.
      var next = markers[markers.indexOf(current) + Number(step.dataset.noteStep)]
      if (!next) return
      next.scrollIntoView({ block: 'center' })
      notes.open(next)
    })
  }

  // ── The entity card ──────────────────────────────────────────────────────

  var cardPanel = document.getElementById('entity-card')
  var island = document.querySelector('script[data-entity-data]')
  if (cardPanel && island) {
    var entities = JSON.parse(island.textContent || '{}')
    var field = function (name) { return cardPanel.querySelector('[data-card-' + name + ']') }
    var kind = field('kind')
    var label = field('label')
    var detail = field('detail')
    var note = field('note')
    var meta = field('meta')

    /** An empty line is removed, not left as a blank gap in the card. */
    var line = function (element, value) {
      element.textContent = value || ''
      element.hidden = !value
    }

    createPopover(cardPanel, '.rs[data-key]', function (trigger) {
      var entity = entities[trigger.dataset.key]
      if (!entity) return false // no register entry: nothing to show
      kind.textContent = entity.kind
      label.textContent = entity.label
      line(detail, entity.detail)
      line(note, entity.note)

      meta.replaceChildren()
      var count = document.createElement('span')
      count.textContent = entity.count === 1 ? '1 Nennung' : entity.count + ' Nennungen'
      meta.append(count)
      entity.links.forEach(function (link) {
        var a = document.createElement('a')
        a.href = link.href
        a.rel = 'noreferrer'
        a.target = '_blank'
        a.textContent = (link.authority + ' ' + link.id + ' ↗').replace(/\s+/g, ' ')
        meta.append(a)
      })
      return true
    })
  }
})()
