'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PlatformPayout, PlatformPayoutStatus } from '@/types/super-admin';

/**
 * ⚠ La table de LIBELLÉS qui vivait ici a été retirée par TCK-292 : les statuts se résolvent sous
 * `billing.platformPayouts.status.*`, la clé étant la valeur d'enum. Ce qui reste est le TON,
 * qui n'est pas du texte.
 *
 * ─── TCK-358 ─ pourquoi ces six lignes ont changé ───
 *
 * Elles portaient six triplets de palette Tailwind brute — ambre, bleu, violet, émeraude, rouge,
 * neutre — c'est-à-dire SIX familles pour six statuts, décidées ici et nulle part ailleurs.
 * C'étaient littéralement les « pastilles faites main » que `StatusBadge` existe pour remplacer,
 * et elles étaient rendues DANS la console super-admin (`/super-admin/payouts` →
 * `AdminPayoutsClient` → ce fichier) sans qu'aucune garde ne les voie : le périmètre de
 * `check-super-admin-tokens.mjs` nommait quatre répertoires, et `src/components/billing` n'en
 * était pas. *Un périmètre est une liste de répertoires ; un écran est un graphe de rendu — les
 * deux ne coïncident jamais tout seuls.*
 *
 * Le mapping fait DEUX tons de moins que l'ancien, et c'est délibéré : `StatusBadge` n'en publie
 * que cinq, et son propre docblock pose qu'un sixième ton signifie qu'on avait besoin d'une
 * colonne, pas d'une couleur. `approved` et `processing` partagent donc `info` — tous deux
 * disent « décidé, pas encore versé », et c'est le LIBELLÉ, traduit, qui les distingue. La
 * couleur porte l'état d'avancement, pas l'identité du statut.
 *
 * ⚠ Ce composant sert AUSSI la console agence (`AgencyPayoutsClient`) et le panneau de détail
 * (`PayoutDetailPanel`) : le changement de vocabulaire y est le même, ce qui est l'effet
 * recherché — une pastille de statut ne doit pas changer de langue de couleur selon l'écran qui
 * la monte.
 */
const STATUS_TONE: Record<PlatformPayoutStatus, StatusTone> = {
  pending: 'attention',
  approved: 'info',
  processing: 'info',
  paid: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

export function PayoutStatusPill({ status }: { status: PlatformPayoutStatus }) {
  const tStatus = useTranslations('billing.platformPayouts.status');
  return <StatusBadge label={tStatus(status)} tone={STATUS_TONE[status]} data-testid={`payout-status-${status}`} />;
}

export function formatXof(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  }
}

export function PayoutTable({
  payouts,
  isLoading,
  onSelect,
  emptyHint,
}: {
  payouts: PlatformPayout[];
  isLoading?: boolean;
  onSelect?: (payout: PlatformPayout) => void;
  emptyHint?: string;
}) {
  // Hooks AVANT toute sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('billing.platformPayouts.table');

  if (isLoading) return <Skeleton className="h-60 rounded-xl" />;

  if (payouts.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {emptyHint ?? t('empty')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t('period')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('agency')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('gross')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('commission')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('net')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('status')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('paidOn')}</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr
                  key={payout.id}
                  onClick={() => onSelect?.(payout)}
                  className={`border-b border-border/40 last:border-b-0 ${onSelect ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                >
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{formatPeriod(payout)}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">#{payout.agency_id}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatXof(payout.gross_amount, payout.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    -{formatXof(payout.platform_fee_amount, payout.currency)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {formatXof(payout.net_amount, payout.currency)}
                  </td>
                  <td className="px-4 py-2"><PayoutStatusPill status={payout.status} /></td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {payout.processed_at ? new Date(payout.processed_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function formatPeriod(payout: PlatformPayout): string {
  const end = payout.period_end ? new Date(payout.period_end).toLocaleDateString('fr-FR') : '—';
  const start = payout.period_start ? new Date(payout.period_start).toLocaleDateString('fr-FR') : '—';
  return `${start} → ${end}`;
}
