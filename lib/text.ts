/** Lower case without accents, so a search for "helene" finds "Hélène". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
