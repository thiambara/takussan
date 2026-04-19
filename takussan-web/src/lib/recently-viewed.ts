const KEY = 'takussan.recent_properties';
const MAX = 10;

export type RecentItem = {
  id: number;
  slug: string;
  title: string;
  price: number;
  currency: string;
  main_photo_url: string | null;
  viewed_at: string;
};

export function pushRecent(item: Omit<RecentItem, 'viewed_at'>): void {
  if (typeof window === 'undefined') return;
  const items: RecentItem[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  const filtered = items.filter((i) => i.id !== item.id);
  filtered.unshift({ ...item, viewed_at: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX)));
}

export function readRecent(excludeId?: number): RecentItem[] {
  if (typeof window === 'undefined') return [];
  const items: RecentItem[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
  return excludeId ? items.filter((i) => i.id !== excludeId) : items;
}

export function clearRecent(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
