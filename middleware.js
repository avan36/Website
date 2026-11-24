// Routing Middleware on Vercel, for one page only: /pushkar, a date invitation
// that lasts 24 hours. After that the server stops sending the letter.
export const config = { matcher: ['/pushkar', '/pushkar.html'] };

const EXPIRES = Date.parse('2026-11-25T01:00:00Z');

export default function middleware() {
  if (Date.now() <= EXPIRES) return;
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>A letter</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#4a1d3f;color:#f7c9d6;font:22px/1.4 Georgia,serif;text-align:center;padding:24px">This little letter has been read and tucked away.</body></html>';
  return new Response(html, {
    status: 410,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' },
  });
}
