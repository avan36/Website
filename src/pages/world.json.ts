// The whole site as one JSON document: who, what they've made and written,
// and the island it's all laid out on. Every view on the home page is drawn
// from exactly this. Build your own renderer if you like.
import type { APIRoute } from 'astro';
import { loadWorld } from '../world/load';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await loadWorld(), null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
