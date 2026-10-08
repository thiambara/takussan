'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { CheckoutEnCours } from '@/components/payments/checkout-en-cours';

/**
 * TCK-593 (passe 2, M5) — un checkout en ligne vit sur l'échéance (l'API a rendu 409
 * `payment.checkout_in_progress`), et le gestionnaire a pourtant reçu le règlement au guichet.
 * Il peut passer outre, en le confirmant et en donnant un motif : le paiement en ligne en cours, s'il
 * aboutit quand même, sera signalé comme double encaissement.
 */
export function PasserOutreDialog({
  checkout,
  occupe,
  onAnnuler,
  onConfirmer,
}: {
  readonly checkout: CheckoutEnCours | null;
  readonly occupe: boolean;
  readonly onAnnuler: () => void;
  readonly onConfirmer: (motif: string) => void;
}) {
  const t = useTranslations('lease.schedule.lateFee.override');
  const locale = useLocale() as Locale;
  const [confirme, setConfirme] = useState(false);
  const [motif, setMotif] = useState('');

  const fermer = () => {
    setConfirme(false);
    setMotif('');
    onAnnuler();
  };

  return (
    <Dialog
      open={checkout !== null}
      onOpenChange={(ouvert) => !ouvert && fermer()}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          {checkout && (
            <DialogDescription>
              {t('description', {
                amount: formatCurrency(checkout.montant, locale, {
                  currency: checkout.devise,
                }),
              })}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <input
              id="passer-outre-confirme"
              type="checkbox"
              checked={confirme}
              onChange={(e) => setConfirme(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
            />
            <label
              htmlFor="passer-outre-confirme"
              className="cursor-pointer text-sm text-foreground"
            >
              {t('confirm')}
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="passer-outre-motif">{t('reason')}</Label>
            <Textarea
              id="passer-outre-motif"
              value={motif}
              maxLength={500}
              placeholder={t('reasonPlaceholder')}
              onChange={(e) => setMotif(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={fermer}
            disabled={occupe}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirmer(motif.trim())}
            disabled={occupe || !confirme || motif.trim() === ''}
          >
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
