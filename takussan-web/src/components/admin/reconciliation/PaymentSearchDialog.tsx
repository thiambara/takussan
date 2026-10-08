'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { formatCurrency, formatDate } from '@/lib/format';
import { usePaymentSearch } from '@/lib/queries/reconciliation';
import type { Locale } from '@/i18n/config';
import type { BankStatementLine, MatchCandidate } from '@/types/reconciliation';

import { enNombre } from './format';

/**
 * TCK-593 (Partie 4) — recherche manuelle du paiement d'une ligne de relevé.
 *
 * La recherche porte le SENS de la ligne (`direction`) : un encaissement ne se rapproche pas d'un
 * reversement sortant. L'API le refuse aussi (422) ; le filtrer ici évite de proposer un geste
 * voué à l'échec.
 */
export function PaymentSearchDialog({
  agencyId,
  ligne,
  onClose,
  onChoisir,
}: {
  readonly agencyId: number;
  readonly ligne: BankStatementLine;
  readonly onClose: () => void;
  readonly onChoisir: (candidat: MatchCandidate) => Promise<void>;
}) {
  const t = useTranslations('admin.reconciliation.search');
  const tTypes = useTranslations('admin.reconciliation.paymentTypes');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const montantLigne = enNombre(ligne.amount);
  const [saisie, setSaisie] = useState(ligne.reference ?? '');
  const [montant, setMontant] = useState(montantLigne !== null ? String(montantLigne) : '');
  const [criteres, setCriteres] = useState<{ q: string; amount: number | null } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const resultats = usePaymentSearch(
    agencyId,
    criteres?.q ?? '',
    criteres?.amount ?? null,
    ligne.direction,
    criteres !== null,
  );

  function chercher(e: FormEvent) {
    e.preventDefault();
    setCriteres({ q: saisie.trim(), amount: enNombre(montant) });
  }

  async function choisir(candidat: MatchCandidate) {
    setErreur(null);
    setEnCours(true);
    try {
      await onChoisir(candidat);
    } catch (err) {
      setErreur(messageErreur(err, t('matchFailed')));
    } finally {
      setEnCours(false);
    }
  }

  const candidats = resultats.data?.data ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {ligne.direction ? t(`hint.${ligne.direction}`) : t('hint.any')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={chercher} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="recherche-q">{t('query')}</Label>
            <Input id="recherche-q" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recherche-montant">{t('amount')}</Label>
            <Input
              id="recherche-montant"
              inputMode="decimal"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
            />
          </div>
          <Button type="submit">{t('submit')}</Button>
        </form>

        {erreur && (
          <p role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        )}

        {criteres !== null && (
          <div className="max-h-80 overflow-y-auto">
            {resultats.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('searching')}</p>
            ) : resultats.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {messageErreur(resultats.error, t('error'))}
              </p>
            ) : candidats.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {candidats.map((c) => (
                  <li key={`${c.type}-${c.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {tTypes(c.type)} · {c.reference ?? `#${c.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[c.payer_name, c.paid_at ? formatDate(c.paid_at, locale) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-foreground">
                        {formatCurrency(enNombre(c.amount), locale, { currency: c.currency ?? 'XOF' })}
                      </span>
                      <Button type="button" size="sm" disabled={enCours} onClick={() => void choisir(c)}>
                        {t('choose')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
