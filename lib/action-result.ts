/**
 * What every Server Action returns to the client form that called it: a
 * localized message for the toast, and on success any data the client needs
 * next (e.g. where to navigate). Domain errors never surface raw.
 */
export type ActionResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; message: string };
