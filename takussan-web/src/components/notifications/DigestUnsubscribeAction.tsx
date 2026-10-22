'use client';

import { useState } from 'react';
import { BellOff, Check, Link2Off, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { lireLienDuResume, unsubscribeDigest } from '@/lib/queries/digest-unsubscribe';

interface DigestUnsubscribeActionProps {
  readonly user: string | null;
  readonly expires: string | null;
  readonly signature: string | null;
}

/**
 * P97.06 (TCK-1243, ADR-0050) — la page où mène le lien « se désabonner » du résumé par courriel.
 *
 * ⚠ Rien ne part au chargement : le désabonnement est un `POST`, déclenché par UN bouton. Un
 * analyseur de liens qui ouvre la page ne désabonne personne. Un lien qui n'a pas la forme
 * attendue rend « lien invalide » sans appeler l'API. Même parcours que les alertes de recherche
 * (`SearchAlertLinkAction`), dont il reprend les libellés communs.
 */
export function DigestUnsubscribeAction(props: DigestUnsubscribeActionProps) {
  const t = useTranslations('search.alertPages');
  const lien = lireLienDuResume(props);
  const [etat, setEtat] = useState<'idle' | 'working' | 'done' | 'invalid' | 'error'>(lien ? 'idle' : 'invalid');

  if (etat === 'invalid' || !lien) {
    return (
      <EmptyState
        data-testid="digest-unsubscribe-invalid"
        icon={<Link2Off className="size-8" aria-hidden="true" />}
        title={t('invalidTitle')}
        description={t('invalidBody')}
        action={
          <LienLocalise href="/properties" className={buttonVariants({ variant: 'outline' })}>
            {t('backToSearch')}
          </LienLocalise>
        }
      />
    );
  }

  if (etat === 'done') {
    return (
      <EmptyState
        data-testid="digest-unsubscribe-done"
        role="status"
        icon={<Check className="size-8" aria-hidden="true" />}
        title={t('digest.doneTitle')}
        description={t('digest.doneBody')}
      />
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
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
        <BellOff className="size-6 text-primary" aria-hidden="true" />
      </div>
      <p className="mb-6 text-sm text-pretty text-muted-foreground">{t('digest.body')}</p>
      <Button type="button" onClick={() => void agir()} disabled={etat === 'working'} className="min-h-11 w-full sm:w-auto">
        {etat === 'working' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {etat === 'working' ? t('digest.working') : t('digest.button')}
      </Button>
      {etat === 'error' ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {t('error')}
        </p>
      ) : null}
    </div>
  );
}
