// Newsletter signups from /blog. Resend keeps the list and sends the emails.
// Nobody joins until they click the link in their confirmation email. The link
// carries a signature rather than anything stored here, so nothing is kept
// until then. Needs the RESEND_API_KEY and NEWSLETTER_SECRET secrets, and the
// RESEND_SEGMENT_ID var in wrangler.jsonc. The link in the email is on the site's
// own domain, which spam filters trust more than workers.dev: vercel.json
// forwards /newsletter/confirm here.
const RESEND_API = "https://api.resend.com";
const FROM = "Ambrose Vannier <newsletter@ambrosevannier.com>";
const SITE = "https://www.ambrosevannier.com";
const WELCOME_URL = `${SITE}/blog#subscribed`;

const utf8 = (s) => new TextEncoder().encode(s);
const hmacKey = (secret) =>
  crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function sign(email, secret) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), utf8(email));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verify(email, token, secret) {
  if (!/^[0-9a-f]{64}$/.test(token)) return false;
  const sig = Uint8Array.from(token.match(/../g), (hex) => parseInt(hex, 16));
  return crypto.subtle.verify("HMAC", await hmacKey(secret), sig, utf8(email));
}

function resend(env, path, body) {
  return fetch(`${RESEND_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "ambrosevannier.com",
    },
    body: JSON.stringify(body),
  });
}

// Emails the visitor a link to confirm.
export async function sendConfirmation(rawEmail, env) {
  const email = String(rawEmail || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return { status: 400, body: { ok: false, error: "That email doesn't look quite right." } };
  }

  const link = new URL("/newsletter/confirm", SITE);
  link.searchParams.set("email", email);
  link.searchParams.set("token", await sign(email, env.NEWSLETTER_SECRET));

  const res = await resend(env, "/emails", {
    from: FROM,
    to: email,
    subject: "Confirm your subscription",
    text:
`Thanks for signing up for new posts from ambrosevannier.com.

Confirm here and you're in:
${link}

If this wasn't you, ignore this and you won't hear from me again.

Ambrose
`,
    html:
`<p>Thanks for signing up for new posts from ambrosevannier.com.</p>
<p><a href="${String(link).replace(/&/g, "&amp;")}">Confirm your subscription</a></p>
<p>If this wasn't you, ignore this and you won't hear from me again.</p>
<p>Ambrose</p>`,
  });
  if (!res.ok) {
    return { status: 502, body: { ok: false, error: "Something went wrong on my end. Please try again in a moment." } };
  }
  return { status: 200, body: { ok: true } };
}

// The confirmation link lands here. Clicking it twice is harmless: creating the
// contact again may fail, but adding it to the segment is what counts.
export async function confirmSubscription(url, env) {
  const email = url.searchParams.get("email") || "";
  const token = url.searchParams.get("token") || "";
  const text = { "Content-Type": "text/plain; charset=utf-8" };

  if (!(await verify(email, token, env.NEWSLETTER_SECRET))) {
    return new Response("That link doesn't look right. Please sign up again.", { status: 400, headers: text });
  }

  await resend(env, "/contacts", { email, unsubscribed: false });
  const added = await resend(env, `/contacts/${encodeURIComponent(email)}/segments/${env.RESEND_SEGMENT_ID}`);
  if (!added.ok) {
    return new Response("Something went wrong on my end. Please try the link again in a moment.", { status: 502, headers: text });
  }
  return Response.redirect(WELCOME_URL, 303);
}
