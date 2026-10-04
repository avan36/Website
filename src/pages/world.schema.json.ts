// JSON Schema for /world.json, generated from the same zod schema that
// validates the world at build time, so the two can't drift apart.
import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { WorldSchema } from '../world/schema';

export const GET: APIRoute = () => {
  const schema = z.toJSONSchema(WorldSchema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' });
  return new Response(
    JSON.stringify({ $id: 'https://ambrosevannier.com/world.schema.json', title: 'World', ...schema }, null, 2),
    { headers: { 'Content-Type': 'application/schema+json; charset=utf-8' } },
  );
};
