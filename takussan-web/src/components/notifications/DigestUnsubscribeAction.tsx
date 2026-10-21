'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BellOff, Check, Link2Off, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { lireLienDeResume, unsubscribeDigest } from '@/lib/queries/digest-unsubscribe';

interface DigestUnsubscribeActionProps {
  readonly user?: string | null;
  readonly expires?: string | null;
  readonly signature?: string | null;
}

const PREFERENCES = '/app/profile/notifications';

/**
 * P97.06 (TCK-1183, modèle d'ADR-0050) — la page où mène le lien de désabonnement du résumé par
 * e-mail.
 *
 * ⚠ Rien ne part au chargement : l'action est un `POST`, déclenché par UN bouton. Un analyseur de
 * liens qui ouvre la page — et parfois exécute son JavaScript — ne désinscrit personne. Les
 * paramètres viennent de l'URL, donc de n'importe qui : un lien hors forme rend l'écran « lien
 * invalide » sans appeler l'API.
 */
export function DigestUnsubscribeAction(props: DigestUnsubscribeActionProps) {
  const t = useTranslations('digestUnsubscribe');
  const lien = lireLienDeResume(props);
  const [etat, setEtat] = useState<'idle' | 'working' | 'done' | 'invalid' | 'error'>(lien ? 'idle' : 'invalid');

  const versLesPreferences = (
    <Link href={PREFERENCES} className={buttonVariants({ variant: 'outline' })}>
      {t('preferences')}
    </Link>
  );

  if (etat === 'invalid' || !lien) {
    return (
      <EmptyState
        data-testid="digest-unsubscribe-invalid"
        icon={<Link2Off className="size-8" aria-hidden="true" />}
        title={t('invalidTitle')}
        description={t('invalidBody')}
        action={versLesPreferences}
      />
    );
  }

  if (etat === 'done') {
    return (
      <EmptyState
        data-testid="digest-unsubscribe-done"
        role="status"
        icon={<Check className="size-8" aria-hidden="true" />}
        title={t('doneTitle')}
        description={t('doneBody')}
        action={versLesPreferences}
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
      // 403 : signature fausse ou échue ; 404 : le compte n'existe plus. Les deux disent la même
      // chose à la personne : ce lien ne sert plus.
      const status = err instanceof ApiError ? err.status : 0;
      setEtat(status === 403 || status === 404 ? 'invalid' : 'error');
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
        <BellOff className="size-6 text-primary" aria-hidden="true" />
      </div>
      <p className="mb-6 text-sm text-pretty text-muted-foreground">{t('body')}</p>
      <Button type="button" onClick={() => void agir()} disabled={etat === 'working'} className="min-h-11 w-full sm:w-auto">
        {etat === 'working' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {etat === 'working' ? t('working') : t('button')}
      </Button>
      {etat === 'error' ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {t('error')}
        </p>
      ) : null}
    </div>
  );
}
