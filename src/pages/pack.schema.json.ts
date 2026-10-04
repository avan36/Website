// JSON Schema for /pack.json, generated from the same zod schema that checks
// the pack at build time, so the two can't drift apart.
import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { PackSchema } from '../world/pack';

export const GET: APIRoute = () => {
  const schema = z.toJSONSchema(PackSchema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' });
  return new Response(
    JSON.stringify({ $id: 'https://ambrosevannier.com/pack.schema.json', title: 'Content pack', ...schema }, null, 2),
    { headers: { 'Content-Type': 'application/schema+json; charset=utf-8' } },
  );
};
