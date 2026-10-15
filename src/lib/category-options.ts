/** UI-only identity. Keep the stored name/value; never merge category records. */
const categoryNameKey = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function uniqueCategoryNames(names: readonly string[], preferredName?: string): string[] {
  const seen = new Set<string>();
  return names.flatMap(name => {
    const key = categoryNameKey(name);
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [preferredName && categoryNameKey(preferredName) === key ? preferredName : name];
  });
}
