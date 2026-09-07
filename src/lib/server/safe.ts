/**
 * Wraps a server-side data load so pages can render an error panel without
 * building JSX inside try/catch (React's error-boundary lint rule) and so a
 * failing query degrades to a readable message instead of a 500.
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

export async function safeLoad<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
