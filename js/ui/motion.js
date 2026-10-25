/*
 * Mouvement : ressorts, compteur à rouleaux et petites aides d'animation.
 * Toutes les animations passent par `animate()` : avec « Réduire les animations »
 * (réglage du téléphone), il ne reste que des fondus courts, sans déplacement.
 */

/** Simulation d'un ressort (masse 1), convertie en courbe CSS `linear()`. */
function spring(stiffness, damping) {
  let x = 0;
  let v = 0;
  let t = 0;
  const dt = 1 / 240;
  const pts = [0];
  while (t < 3) {
    v += (-stiffness * (x - 1) - damping * v) * dt;
    x += v * dt;
    t += dt;
    pts.push(x);
    if (t > 0.1 && Math.abs(x - 1) < 0.0015 && Math.abs(v) < 0.02) break;
  }
  const n = 48;
  const out = Array.from({ length: n + 1 }, (_, i) => +pts[Math.round((i / n) * (pts.length - 1))].toFixed(4));
  out[0] = 0;
  out[n] = 1;
  return { easing: `linear(${out.join(', ')})`, duration: Math.round(t * 1000) };
}

const HAS_LINEAR = typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)');
// bounce : rebond visible (boutons, coches) ; settle : arrivée franche (écrans, listes) ; soft : lent et souple (barres).
const SPRINGS = { bounce: spring(260, 17), settle: spring(220, 28), soft: spring(140, 20) };
const FALLBACK = {
  bounce: { easing: 'cubic-bezier(.34, 1.5, .64, 1)', duration: 520 },
  settle: { easing: 'cubic-bezier(.2, .9, .25, 1)', duration: 420 },
  soft: { easing: 'cubic-bezier(.3, 1.3, .6, 1)', duration: 650 }
};
export const springOf = name => (HAS_LINEAR ? SPRINGS[name] : FALLBACK[name]);

// Les transitions CSS utilisent les mêmes ressorts.
if (typeof document !== 'undefined') {
  const root = document.documentElement.style;
  ['bounce', 'settle'].forEach(name => {
    const s = springOf(name);
    root.setProperty(`--spring-${name}`, s.easing);
    root.setProperty(`--spring-${name}-dur`, `${s.duration}ms`);
  });
}

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
export const reducedMotion = () => mq.matches;

const DONE = { finished: Promise.resolve(), cancel() {} };

/**
 * Web Animations avec ressort facultatif. Mouvement réduit : seules les clés
 * d'opacité sont gardées (fondu de 140 ms), sinon rien n'est joué.
 */
export function animate(el, keyframes, { spring: name, duration = 300, easing = 'cubic-bezier(.2, .8, .2, 1)', delay = 0, fill = 'backwards' } = {}) {
  if (!el?.animate) return DONE;
  if (name) ({ easing, duration } = springOf(name));
  if (reducedMotion()) {
    keyframes = keyframes.map(f => ('opacity' in f ? { opacity: f.opacity } : {}));
    if (!keyframes.some(f => 'opacity' in f)) return DONE;
    duration = 140;
    easing = 'linear';
    delay = 0;
  }
  return el.animate(keyframes, { duration, delay, easing, fill });
}

export const wait = ms => new Promise(r => setTimeout(r, reducedMotion() ? Math.min(ms, 120) : ms));

/** Petite vibration (Android ; ignorée ailleurs). */
export function haptic(pattern = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non disponible */
  }
}

/** Arrivée en cascade : chaque élément monte de quelques pixels avec un léger décalage. */
export function stagger(nodes, { delay = 0, step = 50, distance = 16 } = {}) {
  [...nodes].forEach((n, i) => animate(n, [{ transform: `translateY(${distance}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'settle', delay: delay + i * step }));
}

/** Petit tremblement horizontal (saisie refusée, plafond franchi). */
export function shake(el) {
  return animate(el, [{ transform: 'none' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'none' }], { duration: 380 });
}

const centerOf = el => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};
const radiusFrom = ([x, y]) => Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

/** Un écran plein (position fixe) s'ouvre en cercle depuis le centre d'un élément. */
export function circleOpen(el, from, { duration = 560 } = {}) {
  const c = centerOf(from);
  return animate(el, [{ clipPath: `circle(36px at ${c[0]}px ${c[1]}px)`, opacity: 0.6 }, { clipPath: `circle(${radiusFrom(c)}px at ${c[0]}px ${c[1]}px)`, opacity: 1 }], { duration, easing: 'cubic-bezier(.3, .9, .2, 1)' });
}

/** Inverse : l'écran se referme dans l'élément d'origine (l'état final reste figé jusqu'à `cancel`). */
export function circleClose(el, to, { duration = 460 } = {}) {
  const c = centerOf(to);
  return animate(el, [{ clipPath: `circle(${radiusFrom(c)}px at ${c[0]}px ${c[1]}px)`, opacity: 1 }, { clipPath: `circle(36px at ${c[0]}px ${c[1]}px)`, opacity: 0 }], { duration, easing: 'cubic-bezier(.5, 0, .2, 1)', fill: 'forwards' });
}

/**
 * Compteur à rouleaux : chaque chiffre défile vers sa nouvelle valeur ;
 * les caractères alignés à droite sont réutilisés, les nouveaux apparaissent.
 */
export class Odometer {
  constructor(el) {
    this.el = el;
    this.cells = [];
    el.classList.add('odo');
  }

  set(text, { pop = true } = {}) {
    const chars = [...String(text)];
    this.el.setAttribute('aria-label', text);
    while (this.cells.length > chars.length) this.cells.shift().node.remove();
    const fresh = new Set();
    while (this.cells.length < chars.length) {
      const cell = { node: document.createElement('span'), kind: null };
      cell.node.className = 'odo__cell';
      cell.node.setAttribute('aria-hidden', 'true');
      this.el.prepend(cell.node);
      this.cells.unshift(cell);
      fresh.add(cell);
    }
    chars.forEach((ch, i) => {
      const cell = this.cells[i];
      if (/\d/.test(ch)) {
        if (cell.kind !== 'digit') {
          cell.node.innerHTML = `<span class="odo__roll">${[...'0123456789'].map(n => `<span>${n}</span>`).join('')}</span>`;
          cell.kind = 'digit';
          cell.roll = cell.node.firstChild;
          cell.roll.style.transition = 'none';
          cell.roll.style.transform = `translateY(${-ch * 10}%)`;
          void cell.roll.offsetHeight;
          cell.roll.style.transition = '';
        } else if (cell.value !== ch) cell.roll.style.transform = `translateY(${-ch * 10}%)`;
        cell.value = ch;
      } else if (cell.kind !== ch) {
        cell.node.textContent = ch;
        cell.kind = ch;
        cell.roll = null;
      }
    });
    if (pop) fresh.forEach(c => animate(c.node, [{ transform: 'translateY(40%) scale(.5)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bounce' }));
  }
}

/** Fait rouler le texte d'un élément d'une valeur à une autre (rendu d'abord sur l'ancienne). */
export function rollText(el, from, to) {
  if (!el || from === to || from == null) return;
  const odo = new Odometer(el);
  el.textContent = '';
  odo.set(from, { pop: false });
  requestAnimationFrame(() => odo.set(to));
}
