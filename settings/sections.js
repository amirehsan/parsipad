/**
 * The Settings page's sections and the links into them.
 *
 * Settings is one page: a nav of in-page links on the left and the sections
 * below one another. A link elsewhere names a section with a hash
 * (settings.html#reading), and the nav marks the section in view with
 * aria-current="location".
 *
 * 3.3.0 grouped the page into four tabs, and links to those tabs still exist
 * in bookmarks and older surfaces, so their names resolve to the section each
 * tab's content now lives in.
 */

/** Section ids, in page order. The first is where the page opens. */
export const SETTINGS_SECTIONS = Object.freeze([
  'providers', 'reading', 'appearance', 'flashcards', 'data', 'shortcuts', 'about'
]);

/**
 * Tab names from 3.3.0 that are not section ids. Its other two tabs,
 * providers and data, kept their names.
 */
const OLD_TAB_SECTIONS = Object.freeze({ general: 'reading', more: 'about' });

/** Events that mean the reader is moving the page, not a link. */
const READER_INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'];

/**
 * The section a URL hash names.
 * @param {string} hash - With or without the leading '#'.
 * @returns {string} A section id; the first section for an empty or unknown hash.
 */
export function resolveSectionHash(hash) {
  const name = String(hash ?? '').replace(/^#/, '');
  const id = Object.hasOwn(OLD_TAB_SECTIONS, name) ? OLD_TAB_SECTIONS[name] : name;
  return SETTINGS_SECTIONS.includes(id) ? id : SETTINGS_SECTIONS[0];
}

/**
 * Wire the section nav: land on the section the URL names, and keep
 * aria-current on the link of the section in view.
 *
 * The section in view is the first one crossing a band from under the sticky
 * header to the middle of the viewport, or the last section once the page is
 * scrolled to the bottom (a short last section never reaches the band's top
 * edge, so the one above it would otherwise keep the label while the last one
 * fills the view). A link click (or a deep link) names
 * the section outright instead, and holds that label until the reader scrolls
 * by hand: otherwise each section the smooth scroll passes would take the
 * label in turn, and a short last section that never reaches the top of the
 * viewport could never be marked at all.
 *
 * Below 720px the nav is a strip that scrolls sideways, and the current link
 * is scrolled into view inside it when the label moves.
 *
 * @param {Document} [doc]
 * @returns {() => void} Removes the listeners and the observer.
 */
export function setupSectionNav(doc = document) {
  const win = doc.defaultView;
  const links = new Map();
  doc.querySelectorAll('.settings-nav a[href^="#"]').forEach((link) => {
    links.set(link.getAttribute('href').slice(1), link);
  });
  const sections = SETTINGS_SECTIONS.map((id) => doc.getElementById(id)).filter(Boolean);
  if (links.size === 0 || sections.length === 0) return () => {};

  const nav = doc.querySelector('.settings-nav');
  const strip = nav.querySelector('.settings-nav-list') ?? nav;
  const lastId = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1];
  const inBand = new Set();
  let held = false;
  let currentId = null;

  const setCurrent = (id) => {
    if (id === currentId) return;
    currentId = id;
    links.forEach((link, linkId) => {
      if (linkId === id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    // Only while the links overflow the strip. The strip is sticky and in
    // view then, so 'nearest' moves the strip and never the page.
    if (strip.scrollWidth > strip.clientWidth) {
      links.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  const atBottom = () => {
    const scrollHeight = doc.documentElement.scrollHeight;
    return scrollHeight > win.innerHeight && win.scrollY + win.innerHeight >= scrollHeight - 1;
  };

  /** Label the section in view, unless a link or deep link holds the label. */
  const update = () => {
    if (held) return;
    const id = atBottom() ? lastId : SETTINGS_SECTIONS.find((sectionId) => inBand.has(sectionId));
    if (id) setCurrent(id);
  };

  const hold = (id) => {
    setCurrent(id);
    held = true;
  };

  const release = () => {
    held = false;
  };

  /**
   * Show the section a hash names. An old or unknown hash has no element to
   * scroll to, so it is rewritten to the section it resolves to and scrolled
   * to here.
   */
  const show = (hash, scroll, behavior) => {
    const id = resolveSectionHash(hash);
    hold(id);
    if (hash.slice(1) !== id) {
      win.history.replaceState(null, '', `#${id}`);
      scroll = true;
    }
    if (scroll) doc.getElementById(id)?.scrollIntoView({ block: 'start', behavior });
  };

  const onClick = (event) => {
    const link = event.target.closest?.('a[href^="#"]');
    if (link && links.has(link.getAttribute('href').slice(1))) {
      hold(link.getAttribute('href').slice(1));
    }
  };

  // Back and Forward between sections, or a hash typed into the address bar.
  const onHashChange = () => show(win.location.hash, false, 'auto');

  nav.addEventListener('click', onClick);
  win.addEventListener('hashchange', onHashChange);
  win.addEventListener('scroll', update, { passive: true });
  for (const type of READER_INPUT_EVENTS) win.addEventListener(type, release, { passive: true });

  // Instant on load: the reader asked for the section, not for a ride to it.
  const initial = win.location.hash;
  if (initial && initial !== '#') {
    show(initial, true, 'instant');
  } else {
    setCurrent(SETTINGS_SECTIONS[0]);
  }

  let observer = null;
  if (typeof win.IntersectionObserver === 'function') {
    // What sits over the top of the page: the header, and below 720px the
    // nav strip as well. Read once; crossing 720px later only shifts the band.
    const topInset = parseFloat(win.getComputedStyle(doc.documentElement).scrollPaddingTop) || 0;
    observer = new win.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inBand.add(entry.target.id);
        else inBand.delete(entry.target.id);
      }
      update();
    }, { rootMargin: `-${topInset}px 0px -50% 0px`, threshold: 0 });
    sections.forEach((section) => observer.observe(section));
  }

  return () => {
    observer?.disconnect();
    nav.removeEventListener('click', onClick);
    win.removeEventListener('hashchange', onHashChange);
    win.removeEventListener('scroll', update);
    for (const type of READER_INPUT_EVENTS) win.removeEventListener(type, release);
  };
}
