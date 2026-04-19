import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { PropertyPriceHistoryItem } from '@/types/property';

interface PropertyPriceHistoryProps {
  history: PropertyPriceHistoryItem[];
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency',
    currency: currency || 'XOF',
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PropertyPriceHistory({ history }: PropertyPriceHistoryProps) {
  if (history.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-stone-900">Historique du prix</h2>
      <ol className="relative border-l border-stone-200 ml-2 space-y-4 pl-6">
        {history.map((item) => {
          const diff = item.new_price - item.old_price;
          const Trend = diff < 0 ? TrendingDown : diff > 0 ? TrendingUp : Minus;
          const trendClass =
            diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-600' : 'text-stone-500';

          return (
            <li key={item.id} className="relative">
              <span className="absolute -left-[29px] top-1 size-3 rounded-full bg-white border-2 border-stone-300" />
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <time className="text-sm text-stone-500">{formatDate(item.changed_at)}</time>
                <div className={`flex items-center gap-1 text-sm font-medium ${trendClass}`}>
                  <Trend className="size-4" aria-hidden />
                  {formatPrice(Math.abs(diff), item.currency)}
                </div>
              </div>
              <p className="text-sm text-stone-700">
                <span className="line-through text-stone-400">
                  {formatPrice(item.old_price, item.currency)}
                </span>{' '}
                → <span className="font-semibold">{formatPrice(item.new_price, item.currency)}</span>
              </p>
              {item.reason && <p className="text-xs text-stone-500 mt-0.5">{item.reason}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
