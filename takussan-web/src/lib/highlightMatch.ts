export type HighlightParts = {
  before: string;
  match: string;
  after: string;
};

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function highlightMatch(label: string, query: string): HighlightParts {
  if (!query) return { before: label, match: '', after: '' };

  const normalizedLabel = normalize(label);
  const normalizedQuery = normalize(query);

  const idx = normalizedLabel.indexOf(normalizedQuery);
  if (idx === -1) return { before: label, match: '', after: '' };

  const end = idx + normalizedQuery.length;
  return {
    before: label.slice(0, idx),
    match: label.slice(idx, end),
    after: label.slice(end),
  };
}
