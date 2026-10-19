// Имена файлов: дата-время + первые слова промпта латиницей + номер варианта.
const RU = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function translit(text) {
  return text
    .toLowerCase()
    .split('')
    .map((char) => (RU[char] !== undefined ? RU[char] : char))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugFromPrompt(prompt, words = 4) {
  const slug = translit(prompt).split('-').filter(Boolean).slice(0, words).join('-');
  return (slug || 'generaciya').slice(0, 60);
}

export function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export function fileBaseName({ prompt, index, total, date }) {
  const parts = [stamp(date), slugFromPrompt(prompt)];
  if (total > 1) parts.push(String(index + 1));
  return parts.join('_');
}
