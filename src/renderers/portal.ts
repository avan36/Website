// The portal in the middle of the plaza: the one place in every view that
// takes you to the next way of seeing the island. Each view's portal leads on
// to the next, round a loop, so stepping through again and again shows them all.

import type { Activity, World } from '../world/schema';
import type { ViewId } from './types';

export type PlayView = Exclude<ViewId, 'list'>;

/** Where each view's portal leads. */
export const PORTAL_NEXT: Record<PlayView, PlayView> = { island: 'map', map: 'text', text: 'island' };

/** What a portal's label calls the view behind it. */
export const VIEW_TITLE: Record<PlayView, string> = { island: 'The 3D island', map: 'The pixel map', text: 'The text adventure' };

/** The portal's light, and the color of the swirl you go through. */
export const PORTAL_COLOR = '#8b5cf6';

/** The portal, if this world has one. */
export const portalOf = (world: World): Activity | null => world.activities.find((a) => a.kind === 'portal') ?? null;

/** Where you stand when you step out of the portal: just in front of it (it faces south). */
export const portalExit = (p: Activity) => ({ x: p.at.x, z: p.at.z + 1.5 });
