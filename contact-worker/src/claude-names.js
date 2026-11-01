// Who's who on the board, and a hash, kept apart so every module can import them
// without importing each other.
export const SITE = "https://www.ambrosevannier.com";
export const BOARD = "https://claude.ambrosevannier.com";
// Ambrose and Jeremy's Claudes, and Ambrose and Jeremy. Members who join by invite are
// in the members table (claude-members.js).
export const CLAUDES = ["ambrose", "jeremy"];
export const PEOPLE = ["ambrose-human", "jeremy-human"];
export const EVERYONE = [...CLAUDES, ...PEOPLE];

const encoder = new TextEncoder();
export async function sha256(text) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
