'use client';

import { useState } from 'react';
import { CircleCheck, Loader2, MailX } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { BasDeLien } from '@/components/lien-public/BasDeLien';
import { CarteDeLien } from '@/components/lien-public/CarteDeLien';
import { EnTeteDeLien } from '@/components/lien-public/EnTeteDeLien';
import { LienMort } from '@/components/lien-public/LienMort';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { lireLienDuResume, unsubscribeDigest } from '@/lib/queries/digest-unsubscribe';

interface DigestUnsubscribeActionProps {
  readonly user: string | null;
  readonly expires: string | null;
  readonly signature: string | null;
}

/**
 * P97.06 (TCK-1243, ADR-0050) — la page où mène le lien « se désabonner » du résumé par courriel.
 * TCK-2514 : « la carte au centre », dans la coque de lien nue.
 *
 * ⚠ Rien ne part au chargement : le désabonnement est un `POST`, déclenché par UN bouton. Un
 * analyseur de liens qui ouvre la page ne désabonne personne. Un lien qui n'a pas la forme
 * attendue rend « lien mort » sans appeler l'API. Même parcours que les alertes de recherche
 * (`SearchAlertLinkAction`), dont il reprend les libellés communs.
 */
export function DigestUnsubscribeAction(props: DigestUnsubscribeActionProps) {
  const t = useTranslations('search.alertPages');
  const lien = lireLienDuResume(props);
  const [etat, setEtat] = useState<'idle' | 'working' | 'done' | 'invalid' | 'error'>(lien ? 'idle' : 'invalid');
  const enTete = <EnTeteDeLien />;

  if (etat === 'invalid' || !lien) {
    return (
      <>
        {enTete}
        <LienMort data-testid="digest-unsubscribe-invalid" titre={t('invalidTitle')}>
          {t('invalidBody')}
        </LienMort>
      </>
    );
  }

  if (etat === 'done') {
    return (
      <>
        {enTete}
        <CarteDeLien
          data-testid="digest-unsubscribe-done"
          className="pb-8"
          ton="succes"
          icone={<CircleCheck />}
          titre={t('digest.doneTitle')}
        >
          <span role="status">{t('digest.doneBody')}</span>
        </CarteDeLien>
      </>
    );
  }

  async function agir() {
    if (!lien) return;
    setEtat('working');
    try {
      await unsubscribeDigest(lien);
      setEtat('done');
    } catch (err) {
      // 403 : signature fausse ou expirée ; 404 : le compte n'existe plus. Ce lien ne sert plus.
      const status = err instanceof ApiError ? err.status : 0;
      setEtat(status === 403 || status === 404 ? 'invalid' : 'error');
    }
  }

  return (
    <>
      {enTete}
      <CarteDeLien data-testid="digest-unsubscribe-action" icone={<MailX />} titre={t('digest.title')}>
        {t('digest.body')}
      </CarteDeLien>
      <div className="h-8" aria-hidden="true" />
      <BasDeLien>
        {etat === 'error' ? <ErrorState message={t('error')} /> : null}
        <Button
          type="button"
          size="lg"
          className="h-12 w-full bg-foreground text-[15px] font-semibold text-background hover:bg-foreground/90"
          disabled={etat === 'working'}
          onClick={() => void agir()}
        >
          {etat === 'working' ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {etat === 'working' ? t('digest.working') : t('digest.button')}
        </Button>
      </BasDeLien>
    </>
  );
}
