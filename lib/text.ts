/** Lower case without accents, so a search for "helene" finds "Hélène". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** A URL-friendly form of a name: "Résidence Les Jasmins" → "residence-les-jasmins". */
export function slugify(name: string, fallback: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return base || fallback;
}
