'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DATE_COURTE, type Formatteurs, useFormatteurs } from '@/lib/format/useFormatteurs';
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

/**
 * Le montant d'un reversement, dans la locale ACTIVE.
 *
 * ⚠ C'est un HOOK, et ce n'en était pas un : `formatXof` vivait hors composant, donc sans locale
 * sous la main, donc avec deux `'fr-FR'` écrits en dur — le motif exact que TCK-364 corrige, dans
 * un répertoire que ni son AC1 (trois répertoires greppés) ni le premier périmètre de
 * `scripts/check-locale-figee.mjs` (cinq répertoires) ne regardaient. `/super-admin/payouts` rendait
 * donc des montants français à un super-admin en `en`. *Un périmètre est une liste de répertoires ;
 * un écran est un graphe de rendu.*
 *
 * Le `try/catch` d'origine gardait `Intl.NumberFormat({ style: 'currency' })` contre un code de
 * devise inconnu. Il disparaît avec lui : `formatCurrency` de `@/lib/format/currency` ne jette pas —
 * un code hors enum retombe sur les métadonnées XOF.
 */
export function useXof(): (amount: number, currency: string) => string {
  const fmt = useFormatteurs();
  return (amount, currency) => fmt.montant(amount, currency, { maximumFractionDigits: 0 });
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
  const fmt = useFormatteurs();
  const xof = useXof();

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
                    <span className="font-medium text-foreground">{formatPeriod(payout, fmt)}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">#{payout.agency_id}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{xof(payout.gross_amount, payout.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    -{xof(payout.platform_fee_amount, payout.currency)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {xof(payout.net_amount, payout.currency)}
                  </td>
                  <td className="px-4 py-2"><PayoutStatusPill status={payout.status} /></td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {fmt.date(payout.processed_at, DATE_COURTE)}
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

/**
 * Reste hors composant — mais reçoit les formatteurs au lieu de figer une locale.
 *
 * C'est la troisième forme juste, à côté du hook et de `@/lib/format` : une fonction pure qui
 * PREND la locale reste testable sans rendu, ce qu'un hook n'est pas. Le repli `'—'` n'est plus
 * écrit ici, il vient de `VALEUR_ABSENTE` que `fmt.date` rend sur une valeur absente.
 */
export function formatPeriod(payout: PlatformPayout, fmt: Formatteurs): string {
  return `${fmt.date(payout.period_start, DATE_COURTE)} → ${fmt.date(payout.period_end, DATE_COURTE)}`;
}
