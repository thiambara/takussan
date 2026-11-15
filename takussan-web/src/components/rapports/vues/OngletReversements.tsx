import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { localeDeLaRequete } from '@/i18n/locale-serveur';
import { formatCurrency, formatDate } from '@/lib/format';
import { fetchUpcomingOwnerPayouts } from '@/lib/rapports/reversements-a-venir';

/**
 * TCK-2628 — l'onglet « Reversements » du bailleur et de l'hôte : les prochains reversements, sortis de
 * `overview/owner/page.tsx` (TCK-595, TCK-1804). Garde : celle de la vue du bailleur (`garderLOnglet`).
 */
export async function OngletReversements() {
  const [t, locale, user] = await Promise.all([getTranslations('dashboard.owner'), localeDeLaRequete(), getMeAction()]);
  const pendingPayouts = await fetchUpcomingOwnerPayouts(user.id);

  return (
    <section className="rounded-2xl bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">{t('nextPayouts')}</h2>
      {pendingPayouts.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {pendingPayouts.map((payout) => (
            <li key={payout.id} className="rounded-lg bg-muted/60 p-3">
              <p className="font-medium text-foreground tabular-nums">
                {formatCurrency(payout.net_amount, locale, { currency: payout.currency ?? 'XOF' })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {payout.reference_number ?? t('payoutFallback', { id: payout.id })}
                {payout.scheduled_at
                  ? t('payoutScheduled', { date: formatDate(payout.scheduled_at, locale) })
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-pretty text-muted-foreground">{t('noPayouts')}</p>
      )}
    </section>
  );
}
