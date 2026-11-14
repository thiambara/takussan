'use client';

import { useTranslations } from 'next-intl';

import { aujourdHuiADakar } from '@/components/payments/locataire/resume';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useDusDuLocataire } from '@/lib/queries/dus-du-locataire';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { ErreurDeBloc } from '../EtatsDeBloc';

/**
 * TCK-2625 (AC4) — « Échéances des 30 prochains jours », reprise de « Ma situation ». Une seule vérité du
 * montant (décision 6 du lead, 2026-11-13) : la liste lit les MÊMES dus que la carte « Loyer » et la page
 * Paiements (`useDusDuLocataire`, même clé, même cache) et affiche ce qui RESTE à payer
 * (`remaining_amount`) — `upcoming_payments` de `/dashboard/me` servait le montant brut, si bien qu'une
 * échéance payée à moitié s'y lisait entière.
 *
 * Retenues : les lignes de bail dont l'échéance tombe d'aujourd'hui à J+30 (fuseau de Dakar), non
 * soldées. Une restitution de caution n'est JAMAIS une échéance à payer (règle de « Ma situation ») :
 * l'historique la sert au même titre qu'un dû, elle est écartée ici.
 */
export const JOURS_DE_L_HORIZON = 30;

export function echeancesDes30Jours(lignes: readonly PaymentHistoryRow[], aujourdHui: string): PaymentHistoryRow[] {
  const fin = new Date(`${aujourdHui}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + JOURS_DE_L_HORIZON);
  const borne = fin.toISOString().slice(0, 10);
  return lignes
    .filter(
      (r) =>
        r.source === 'lease' &&
        r.payment_type !== 'deposit_refund' &&
        r.remaining_amount > 0 &&
        !!r.due_date &&
        r.due_date.slice(0, 10) >= aujourdHui &&
        r.due_date.slice(0, 10) <= borne,
    )
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
}

/** Les statuts de paiement CONNUS (`dashboard.paymentStatus.*`) : un statut inventé s'affiche tel quel. */
const STATUTS_CONNUS = new Set(['pending', 'paid', 'partially_paid', 'late', 'refunded', 'cancelled']);

export function EcheancesDes30Jours({ className }: { readonly className?: string }) {
  const t = useTranslations('dashboard');
  const tBlocs = useTranslations('accueil.blocs');
  const f = useFormatteurs();
  const dus = useDusDuLocataire();
  if (dus.isError) return <ErreurDeBloc quoi={tBlocs('quoi.echeances')} onReessayer={() => void dus.refetch()} className={className} />;
  if (!dus.data) return null;
  const echeances = echeancesDes30Jours(dus.data.data ?? [], aujourdHuiADakar());

  return (
    <section className={cn('rounded-2xl border border-border bg-card p-4', className)} aria-labelledby="echeances-30-jours" data-slot="echeances-30-jours">
      <h2 id="echeances-30-jours" className="mb-2 text-ui font-semibold text-muted-foreground">
        {t('tenant.upcoming30d')}
      </h2>
      {echeances.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('tenant.noUpcoming')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {echeances.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm" data-slot="echeance-a-venir">
              <span className="text-foreground tabular-nums">{p.due_date ? f.date(p.due_date) : '—'}</span>
              <span className="font-semibold text-foreground tabular-nums">{f.montantCourt(p.remaining_amount, p.currency)}</span>
              <span className="text-xs text-muted-foreground">{p.status ? (STATUTS_CONNUS.has(p.status) ? t(`paymentStatus.${p.status}`) : p.status) : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
