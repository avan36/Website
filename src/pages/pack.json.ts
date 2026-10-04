// The content pack: who, what's been made and written, the look, and the
// island's ideas without the island. The portable half of /world.json, for
// whatever gets built next. See src/world/pack.ts and docs/brief.md.
import type { APIRoute } from 'astro';
import { loadWorld } from '../world/load';
import { buildPack } from '../world/pack';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(buildPack(await loadWorld()), null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
