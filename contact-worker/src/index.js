import { EmailMessage } from "cloudflare:email";

// Only accept submissions coming from the real site.
const ALLOWED_ORIGINS = new Set([
  "https://ambrosevannier.com",
  "https://www.ambrosevannier.com",
]);

// Sender must be on a domain with Email Routing enabled (ambrosevannier.com).
// Recipient must be a verified Email Routing destination.
const FROM = "contact@ambrosevannier.com";
const TO = "todos_thorax09@icloud.com";

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://ambrosevannier.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

// UTF-8-safe base64.
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Wrap base64 to 76-char lines (MIME requirement) with CRLF.
function b64Body(str) {
  return b64(str).match(/.{1,76}/g).join("\r\n");
}

// RFC 2047 encoded-word for headers that may contain non-ASCII (names, subject).
function encodeHeader(str) {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(str) ? str : `=?UTF-8?B?${b64(str)}?=`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), { status: 405, headers });
    }

    // The browser sends the body as text/plain (a CORS "simple request") to avoid
    // a preflight round-trip; it still contains JSON. Fall back to URL-encoded.
    let data;
    try {
      const raw = await request.text();
      try {
        data = JSON.parse(raw);
      } catch {
        data = Object.fromEntries(new URLSearchParams(raw));
      }
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid request." }), { status: 400, headers });
    }

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim();
    const message = String(data.message || "").trim();
    const honeypot = String(data.company || "").trim(); // hidden field; humans leave it empty

    // A bot filled the hidden field — accept silently, send nothing.
    if (honeypot) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!name || name.length > 100 || !emailOk || email.length > 200 || !message || message.length > 5000) {
      return new Response(
        JSON.stringify({ ok: false, error: "Please fill in every field with a valid email." }),
        { status: 400, headers },
      );
    }

    const subject = `Portfolio contact from ${name}`;
    const body =
`New message from the ambrosevannier.com contact form

Name:  ${name}
Email: ${email}

${message}
`;

    const raw =
`From: Portfolio Contact <${FROM}>\r
To: ${TO}\r
Reply-To: ${encodeHeader(name)} <${email}>\r
Message-ID: <${crypto.randomUUID()}@ambrosevannier.com>\r
Date: ${new Date().toUTCString()}\r
Subject: ${encodeHeader(subject)}\r
MIME-Version: 1.0\r
Content-Type: text/plain; charset="utf-8"\r
Content-Transfer-Encoding: base64\r
\r
${b64Body(body)}`;

    try {
      await env.EMAIL.send(new EmailMessage(FROM, TO, raw));
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: "Could not send right now. Please email me directly." }),
        { status: 502, headers },
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  },
};
