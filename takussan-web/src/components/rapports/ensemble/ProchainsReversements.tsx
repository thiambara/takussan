import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { formatCurrency, formatDate } from '@/lib/format';
import { fetchUpcomingOwnerPayouts } from '@/lib/rapports/reversements-a-venir';

/**
 * TCK-2628 (L2) — « Prochains reversements » de la vue d'ensemble du bailleur (maquette `BlocReversements`) :
 * les trois premiers (`fetchUpcomingOwnerPayouts` n'en lit pas plus), la date en tête, et « Tous » vers la
 * liste des reversements : `/app/payments?tab=payouts`, que `aiguillerVersLArgent` mène à « Argent ›
 * Reversements » pour l'hôte, admin de son agence.
 */
export async function ProchainsReversements({ limite = 3 }: { readonly limite?: number }) {
  const [t, tRapports, locale, user] = await Promise.all([
    getTranslations('dashboard.owner'),
    getTranslations('rapports'),
    localeDeLaRequete(),
    getMeAction(),
  ]);
  const reversements = (await fetchUpcomingOwnerPayouts(user.id)).slice(0, limite);

  return (
    <section aria-labelledby="rapports-reversements" className="rounded-xl border border-border bg-card">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4">
        <h2 id="rapports-reversements" className="text-corps font-semibold">
          {t('nextPayouts')}
        </h2>
        <Link
          href="/app/payments?tab=payouts"
          className="inline-flex min-h-11 items-center gap-0.5 rounded-sm text-ui font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {tRapports('tous')}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      {reversements.length === 0 ? (
        <p className="px-4 py-4 text-sm text-pretty text-muted-foreground">{t('noPayouts')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {reversements.map((r) => (
            <li key={r.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="w-16 flex-none text-sm font-semibold tabular-nums">
                {r.scheduled_at ? formatDate(r.scheduled_at, locale, { dateStyle: undefined, day: 'numeric', month: 'short' }) : '—'}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-corps font-semibold tabular-nums">{formatCurrency(r.net_amount, locale, { currency: r.currency ?? 'XOF' })}</p>
                <p className="mt-0.5 truncate text-ui text-muted-foreground">{r.reference_number ?? t('payoutFallback', { id: r.id })}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
