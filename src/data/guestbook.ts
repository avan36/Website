// Approved guestbook messages, shown on /contact beside the bottle.
//
// Visitors' notes are NEVER published automatically. Each one is emailed to
// you by the contact worker (subject "Guestbook note from …"), with a ready-
// to-paste line at the bottom of the email. To approve a note, paste that line
// into the array below, then deploy the site as usual:
//
//   { name: 'Ana', message: 'Loved walking the island at night.', date: '2026-10-04' },
//
// `name` is optional (visitors may leave it blank). Keep messages to one line
// (140 characters max). To remove a note, delete its line. The page shows a
// few at random on each visit; with none, it invites the first.

export type GuestbookEntry = { name?: string; message: string; date: string };

export const guestbook: GuestbookEntry[] = [];
