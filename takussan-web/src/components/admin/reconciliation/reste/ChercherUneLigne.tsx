'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useBankLineSearch } from '@/lib/queries/reconciliation';
import type { BankStatementLine, PendingPayment } from '@/types/reconciliation';

import { enNombre } from '../format';
import { FenetreAdaptee } from './FenetreAdaptee';

/**
 * TCK-2675 — chercher, pour un paiement déclaré, la ligne de banque qui le règle : les crédits des
 * relevés OUVERTS de l'agence (`GET …/bank-statement-lines`, TCK-2674), au montant du paiement à
 * un franc près, les plus récents d'abord. Le sens est fixé : un encaissement ne se rapproche que
 * d'un crédit — l'API refuserait l'autre (422).
 *
 * Une ligne déjà rapprochée ou ignorée reste listée, avec son état, sans geste : la cacher ferait
 * croire qu'aucun dépôt n'existe.
 */
export function ChercherUneLigne({
  agencyId,
  paiement,
  banqueDuReleve,
  onFermer,
  onChoisir,
}: {
  readonly agencyId: number;
  readonly paiement: PendingPayment;
  readonly banqueDuReleve: (statementId: number) => string | null;
  readonly onFermer: () => void;
  readonly onChoisir: (ligne: BankStatementLine) => Promise<void>;
}) {
  const t = useTranslations('admin.reconciliation.reste.chercher');
  const tStatut = useTranslations('admin.reconciliation.lineStatus');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const montantDuPaiement = enNombre(paiement.amount);
  const [saisie, setSaisie] = useState(montantDuPaiement !== null ? String(montantDuPaiement) : '');
  const [montant, setMontant] = useState<number | null>(montantDuPaiement);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const resultats = useBankLineSearch(agencyId, montant, null, true);

  function chercher(e: FormEvent) {
    e.preventDefault();
    setMontant(enNombre(saisie.replace(/\s/g, '').replace(',', '.')));
  }

  async function choisir(ligne: BankStatementLine) {
    setErreur(null);
    setEnCours(true);
    try {
      await onChoisir(ligne);
    } catch (err) {
      setErreur(messageErreur(err, t('echec')));
    } finally {
      setEnCours(false);
    }
  }

  const qui = paiement.payer?.name ?? null;
  const description = [qui, montantDuPaiement !== null ? f.montantCourt(montantDuPaiement, paiement.currency ?? 'XOF') : null, paiement.paid_at ? f.jourMois(paiement.paid_at) : null]
    .filter(Boolean)
    .join(' · ');
  const lignes = resultats.data?.data ?? [];

  return (
    <FenetreAdaptee ouvert onFermer={onFermer} titre={t('titre')} description={description}>
      <form onSubmit={chercher} className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="chercher-ligne-montant">{t('montant')}</Label>
          <Input id="chercher-ligne-montant" inputMode="decimal" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
        </div>
        <Button type="submit" variant="outline">
          {t('submit')}
        </Button>
      </form>
      <p className="mt-2 text-ui text-muted-foreground">{t('aide')}</p>

      {erreur ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {erreur}
        </p>
      ) : null}

      <div className="mt-4">
        {resultats.isLoading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : resultats.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {messageErreur(resultats.error, t('erreur'))}
          </p>
        ) : lignes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('aucune')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border" aria-label={t('resultats')}>
            {lignes.map((l) => {
              const libre = l.match_status === 'unmatched' || l.match_status === 'suggested';
              const banque = banqueDuReleve(l.bank_statement_id);
              return (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2.5 text-sm" data-testid={`ligne-trouvee-${l.id}`}>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate font-mono text-xs text-encre-douce">{l.label ?? l.reference ?? '—'}</p>
                    <p className="mt-1 text-ui text-muted-foreground">
                      {[l.posted_at ? f.jourMois(l.posted_at) : null, banque, f.montantCourt(enNombre(l.amount) ?? 0, l.currency ?? 'XOF')].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {libre ? (
                    <Button size="sm" disabled={enCours} onClick={() => void choisir(l)}>
                      {t('rapprocher')}
                    </Button>
                  ) : l.match_status ? (
                    <StatusBadge tone="neutral" label={tStatut(l.match_status)} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </FenetreAdaptee>
  );
}
