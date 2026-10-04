// The wardrobe, drawn for the page: a little SVG for every outfit piece (in
// color once it's unlocked, as a silhouette until then) and the explorer
// wearing what you've picked. The 3D island and the pixel map draw the same
// pieces their own way (island/character.ts, map/explorer.ts); what's unlocked
// where lives in the world (world.ts, `outfits`).
//
// Plain strings, no DOM, so the HUD can drop them straight into its cards.

import type { Outfit, OutfitSlot } from '../world/schema';

export const SLOTS: OutfitSlot[] = ['head', 'face', 'neck', 'body'];
export const SLOT_NAMES: Record<OutfitSlot, string> = { head: 'Head', face: 'Face', neck: 'Neck', body: 'Body' };

/** Mix a #rrggbb color toward black (k > 0) or white (k < 0). */
export function tint(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = k > 0 ? 0 : 255;
  const a = Math.abs(k);
  const ch = (v: number) => Math.round(v + (to - v) * a).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** The shape of each piece, on a 48 × 48 grid, by id; unknown ids get their slot's shape. */
function art(o: Pick<Outfit, 'id' | 'slot' | 'color'>): string {
  const c = o.color;
  const d = tint(c, 0.28);
  switch (o.id) {
    case 'hard-hat':
      return `<path d="M9 31a15 15 0 0 1 30 0Z" fill="${c}"/><path d="M21 16.3a15 15 0 0 1 6 0V31h-6Z" fill="${d}"/><rect x="5" y="30" width="38" height="5.5" rx="2.75" fill="${d}"/>`;
    case 'leaf-crown':
      return `<g fill="${c}"><ellipse cx="11.5" cy="25" rx="3.6" ry="7" transform="rotate(-38 11.5 25)"/><ellipse cx="18" cy="21.5" rx="3.6" ry="8" transform="rotate(-16 18 21.5)"/><ellipse cx="24" cy="19.5" rx="3.6" ry="8.5"/><ellipse cx="30" cy="21.5" rx="3.6" ry="8" transform="rotate(16 30 21.5)"/><ellipse cx="36.5" cy="25" rx="3.6" ry="7" transform="rotate(38 36.5 25)"/></g><path d="M6 29c5 4 31 4 36 0l-.5 4c-5 4-30 4-35 0Z" fill="#8a5a2b"/><circle cx="20.5" cy="28.5" r="2.4" fill="#ffb7c9"/><circle cx="29" cy="29" r="2.4" fill="#ffb7c9"/><circle cx="20.5" cy="28.5" r=".9" fill="#ffd56b"/><circle cx="29" cy="29" r=".9" fill="#ffd56b"/>`;
    case 'mortarboard':
      return `<path d="M14 23v8.5c0 3.5 20 3.5 20 0V23Z" fill="${d}"/><path d="M24 11 45 19.5 24 28 3 19.5Z" fill="${c}"/><path d="M24 19.5 37 23v8" stroke="#f5c542" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="24" cy="19.5" r="2" fill="#f5c542"/><rect x="35.4" y="30" width="3.2" height="7" rx="1.2" fill="#f5c542"/>`;
    case 'fishing-hat':
      return `<path d="M15.5 16c1-4.5 16-4.5 17 0l3 12h-23Z" fill="${c}"/><rect x="13.2" y="23" width="21.6" height="4.5" fill="#5b7a4a"/><path d="M5 31c0-3.2 8-4.5 19-4.5s19 1.3 19 4.5-8 3.5-19 3.5S5 34.2 5 31Z" fill="${d}"/><path d="M30 21.5 34.5 17l1.2 3.6Z" fill="#ff5a36"/>`;
    case 'sailor-hat':
      return `<path d="M13.5 29 15 16.5c3.5-2.6 14.5-2.6 18 0L34.5 29Z" fill="${c}" stroke="${tint(c, 0.18)}" stroke-width="1"/><path d="M15 22.5c4.5 1.6 13.5 1.6 18 0" stroke="#2b5fa8" stroke-width="2.2" fill="none"/><path d="M7 27c4.5 4 29.5 4 34 0l-1.2 6.5c-5 3.5-26.6 3.5-31.6 0Z" fill="${tint(c, 0.08)}" stroke="${tint(c, 0.2)}" stroke-width="1"/>`;
    case 'red-cap':
      return `<path d="M8 31.5c0-9.2 5.8-15 13.5-15S35 22.3 35 31.5Z" fill="${c}"/><path d="M21.5 16.5c-2.6 3.4-3.8 8.6-3.8 15M21.5 16.5c2.6 3.4 3.8 8.6 3.8 15" stroke="${d}" stroke-width="1.2" fill="none"/><circle cx="21.5" cy="16.6" r="1.7" fill="${d}"/><path d="M33 29.5c4.6-.2 9 .6 11.5 2.3-.8 1.8-2.6 2.7-5 2.7H33Z" fill="${d}"/><rect x="7" y="30.5" width="27" height="3.5" rx="1.5" fill="${tint(c, 0.12)}"/>`;
    case 'reading-glasses':
      return `<circle cx="14.5" cy="26" r="6.5" fill="#cfe9f5" fill-opacity=".55"/><circle cx="33.5" cy="26" r="6.5" fill="#cfe9f5" fill-opacity=".55"/><g fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"><circle cx="14.5" cy="26" r="7"/><circle cx="33.5" cy="26" r="7"/><path d="M21.5 25c1.6-1.8 3.4-1.8 5 0M7.5 24.5 3.5 21M40.5 24.5l4-3.5"/></g>`;
    case 'sunglasses':
      return `<path d="M5 20.5h38v3.2h-1.6l-1.8 7c-.6 2.2-2.2 3.3-4.4 3.3h-5.4c-2.2 0-3.8-1.3-4.3-3.5L24.3 25h-.6l-1.2 5.5C22 32.7 20.4 34 18.2 34h-5.4c-2.2 0-3.8-1.1-4.4-3.3l-1.8-7H5Z" fill="${c}"/><path d="M11 27.5l3.5-2.6M29 27.5l3.5-2.6" stroke="#fff" stroke-opacity=".55" stroke-width="1.8" stroke-linecap="round"/>`;
    case 'cardinal-scarf':
      return `<path d="M7 16c2.5 7 31.5 7 34 0l1 8c-2.5 8-33.5 8-36 0Z" fill="${c}"/><path d="M27 27.5 29.5 44l7.5-1.6-3.6-15.4Z" fill="${d}"/><path d="M29.4 41h7.4" stroke="${tint(c, -0.35)}" stroke-width="1.6"/><path d="M13 22.5v5M19 24v5.5M25 24.5v5.5" stroke="${d}" stroke-width="1.4" stroke-linecap="round"/>`;
    case 'tool-belt':
      return `<path d="M15 31.5h7v8.5c0 1.4-1 2.5-2.5 2.5h-2c-1.4 0-2.5-1.1-2.5-2.5Z" fill="${d}"/><path d="M28 31.5h8v7.5c0 1.4-1 2.5-2.5 2.5h-3c-1.4 0-2.5-1.1-2.5-2.5Z" fill="${d}"/><path d="M16.5 32 13 13.5l2.6-.6L19.4 31Z" fill="#ffbe0b"/><path d="M13 13.5l.6-3.4 2 2.8Z" fill="#f2d3a2"/><rect x="31.2" y="17" width="2.6" height="15" rx="1" fill="#8a5a2b"/><rect x="27.5" y="13.5" width="10" height="4.5" rx="1.2" fill="#6b7280"/><rect x="4" y="24" width="40" height="8" rx="2" fill="${c}"/><rect x="20" y="22.5" width="8" height="11" rx="1.5" fill="none" stroke="#f2c14e" stroke-width="2.2"/><path d="M4 26.5h40" stroke="${tint(c, -0.25)}" stroke-width=".9" stroke-dasharray="2 2"/>`;
    case 'recycling-vest':
      return `<path d="M14 7h6c.5 6.5 7.5 6.5 8 0h6l6 8v25c0 2-1 3-3 3H11c-2 0-3-1-3-3V15Z" fill="${c}"/><path d="M24 14v29" stroke="${d}" stroke-width="1.6"/><rect x="8" y="27" width="32" height="4" fill="#e9f1dc"/><rect x="8" y="34.5" width="32" height="2.5" fill="#e9f1dc" fill-opacity=".8"/>`;
  }
  // Something new in the world: draw its slot's generic shape.
  const generic: Record<OutfitSlot, string> = {
    head: `<path d="M10 30a14 14 0 0 1 28 0Z" fill="${c}"/><rect x="6" y="29" width="36" height="5" rx="2.5" fill="${d}"/>`,
    face: `<g fill="none" stroke="${c}" stroke-width="3"><circle cx="14.5" cy="26" r="7"/><circle cx="33.5" cy="26" r="7"/><path d="M21.5 25c1.6-1.8 3.4-1.8 5 0"/></g>`,
    neck: `<path d="M7 16c2.5 7 31.5 7 34 0l1 8c-2.5 8-33.5 8-36 0Z" fill="${c}"/><path d="M27 27.5 29.5 44l7.5-1.6-3.6-15.4Z" fill="${d}"/>`,
    body: `<path d="M14 7h6c.5 6.5 7.5 6.5 8 0h6l6 8v25c0 2-1 3-3 3H11c-2 0-3-1-3-3V15Z" fill="${c}"/>`,
  };
  return generic[o.slot];
}

/** One piece on its own, for a tile. Locked pieces are drawn as a silhouette. */
export function outfitIcon(o: Pick<Outfit, 'id' | 'slot' | 'color'>, locked = false, size = 48): string {
  return `<svg class="w-ward__icon${locked ? ' is-locked' : ''}" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${art(o)}</svg>`;
}

/** The tool belt on the avatar: a band low on the body, a buckle, two pouches and a pencil. */
function belt(c: string): string {
  const d = tint(c, 0.25);
  return `<g clip-path="url(#w-av-body)"><rect x="10" y="103" width="100" height="6.5" fill="${c}"/><path d="M10 106.2h100" stroke="${tint(c, -0.25)}" stroke-width=".8" stroke-dasharray="2 2"/></g>
    <rect x="55" y="101.5" width="10" height="9.5" rx="1.5" fill="none" stroke="#f2c14e" stroke-width="2.2"/>
    <path d="M36.5 108 33 95.5l2.4-.7 3.8 12.6Z" fill="#ffbe0b"/><path d="M33 95.5l.5-2.6 1.9 1.9Z" fill="#f2d3a2"/>
    <rect x="77.2" y="96" width="2.2" height="12" rx=".8" fill="#8a5a2b"/><rect x="74" y="93.5" width="8.6" height="3.6" rx="1" fill="#6b7280"/>
    <path d="M31 108.5h10v6.5c0 1.5-1.1 2.6-2.6 2.6h-4.8c-1.5 0-2.6-1.1-2.6-2.6Z" fill="${d}"/>
    <path d="M73 108.5h10v6.5c0 1.5-1.1 2.6-2.6 2.6h-4.8c-1.5 0-2.6-1.1-2.6-2.6Z" fill="${d}"/>`;
}

/** The explorer (front on, as in the 3D island), wearing `worn`. */
export function avatar(worn: Outfit[], size = 120): string {
  const by = (slot: OutfitSlot) => worn.find((o) => o.slot === slot);
  const head = by('head');
  const face = by('face');
  const neck = by('neck');
  const body = by('body');
  const scarf = neck?.color ?? '#ff5a36';
  const scarfD = tint(scarf, 0.25);
  const ink = '#1f1a17';
  const sprout = !head || head.id === 'leaf-crown';
  const nest = (o: Outfit, x: number, y: number, s: number) => `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 48 48">${art(o)}</svg>`;
  return `<svg class="w-ward__avatar-art" width="${size}" height="${Math.round(size * 1.08)}" viewBox="0 0 120 130" aria-hidden="true">
    <defs><clipPath id="w-av-body"><circle cx="60" cy="74" r="40"/></clipPath></defs>
    <ellipse cx="60" cy="122" rx="34" ry="5" fill="rgba(40,30,20,.16)"/>
    <ellipse cx="45" cy="116" rx="11" ry="7" fill="#6b4a3a"/><ellipse cx="75" cy="116" rx="11" ry="7" fill="#6b4a3a"/>
    <circle cx="60" cy="74" r="40" fill="#fffaf1" stroke="rgba(29,26,22,.12)" stroke-width="1.5"/>
    ${body && body.id !== 'tool-belt' ? `<g clip-path="url(#w-av-body)"><path d="M10 64h40l10 22 10-22h40v60H10Z" fill="${body.color}"/><path d="M60 86v40" stroke="${tint(body.color, 0.28)}" stroke-width="1.6"/><rect x="10" y="98" width="100" height="5" fill="#e9f1dc"/></g>` : ''}
    <ellipse cx="18" cy="80" rx="7" ry="9.5" fill="#fffaf1" stroke="rgba(29,26,22,.12)" stroke-width="1.5"/><ellipse cx="102" cy="80" rx="7" ry="9.5" fill="#fffaf1" stroke="rgba(29,26,22,.12)" stroke-width="1.5"/>
    <ellipse cx="38" cy="80" rx="6" ry="3.6" fill="#ff9e9e"/><ellipse cx="82" cy="80" rx="6" ry="3.6" fill="#ff9e9e"/>
    <ellipse cx="47" cy="68" rx="5" ry="7.2" fill="${ink}"/><ellipse cx="73" cy="68" rx="5" ry="7.2" fill="${ink}"/>
    <circle cx="49" cy="65" r="1.7" fill="#fff"/><circle cx="75" cy="65" r="1.7" fill="#fff"/>
    <path d="M55.5 79.5a4.5 4.5 0 0 0 9 0" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>
    ${face ? nest(face, 27, 32, 66) : ''}
    <path d="M22 88c12 9 64 9 76 0l1 8c-12 10-66 10-78 0Z" fill="${scarf}"/>
    <path d="M78 96l4 20 8-2-5-19Z" fill="${scarfD}"/>
    ${body?.id === 'tool-belt' ? belt(body.color) : ''}
    ${sprout ? `<g fill="#57c15a"><rect x="58.8" y="22" width="2.6" height="13" rx="1.3"/><ellipse cx="52" cy="22" rx="7.5" ry="3.4" transform="rotate(-20 52 22)"/><ellipse cx="68" cy="22" rx="7.5" ry="3.4" transform="rotate(20 68 22)"/></g>` : ''}
    ${head ? nest(head, 26, head.id === 'leaf-crown' ? 6 : 3, 68) : ''}
  </svg>`;
}
