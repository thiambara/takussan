'use client';

import { useState } from 'react';
import { BellOff, BellRing, Check, Link2Off, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button, buttonVariants } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import {
  confirmPublicSearchAlert,
  lireLienDeCompte,
  unsubscribeAccountSearch,
  unsubscribePublicSearchAlert,
} from '@/lib/queries/public-search-alerts';

/** La forme d'un jeton émis par `AlertSubscriber::newToken()` : base64url de 32 octets. */
const FORME_DU_JETON = /^[A-Za-z0-9_-]{20,128}$/;

interface SearchAlertLinkActionProps {
  readonly mode: 'confirm' | 'unsubscribe';
  readonly token?: string | null;
  readonly search?: string | null;
  readonly expires?: string | null;
  readonly signature?: string | null;
}

type Action =
  | { readonly kind: 'confirm'; readonly token: string }
  | { readonly kind: 'contact'; readonly token: string }
  | { readonly kind: 'account'; readonly link: NonNullable<ReturnType<typeof lireLienDeCompte>> };

function actionDuLien(props: SearchAlertLinkActionProps): Action | null {
  if (props.mode === 'unsubscribe' && props.search != null) {
    const link = lireLienDeCompte(props);
    return link ? { kind: 'account', link } : null;
  }
  if (!props.token || !FORME_DU_JETON.test(props.token)) return null;
  return props.mode === 'confirm' ? { kind: 'confirm', token: props.token } : { kind: 'contact', token: props.token };
}

/**
 * TCK-599 (ADR-0050 §4) — les pages où mènent les liens d'un e-mail d'alerte : confirmer une
 * alerte sans compte, ou s'en désinscrire (sans compte, ou l'alerte d'un compte par son lien
 * signé).
 *
 * ⚠ Rien ne part au chargement : l'action est un `POST`, déclenché par UN bouton. Un scanneur
 * de liens qui ouvre la page — et parfois exécute son JavaScript — ne confirme ni ne désinscrit
 * personne. Les paramètres viennent de l'URL, donc de n'importe qui : un lien qui n'a pas la
 * forme attendue rend l'écran « lien invalide » sans appeler l'API.
 */
export function SearchAlertLinkAction(props: SearchAlertLinkActionProps) {
  const t = useTranslations('search.alertPages');
  const action = actionDuLien(props);
  const [etat, setEtat] = useState<'idle' | 'working' | 'done' | 'invalid' | 'error'>(
    action ? 'idle' : 'invalid',
  );

  if (etat === 'invalid' || !action) {
    return (
      <EmptyState
        data-testid="search-alert-invalid"
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

  const page = action.kind === 'confirm' ? 'confirm' : 'unsubscribe';

  if (etat === 'done') {
    const corps =
      action.kind === 'confirm'
        ? t('confirm.doneBody')
        : action.kind === 'contact'
          ? t('unsubscribe.doneContact')
          : t('unsubscribe.doneAccount');
    return (
      <EmptyState
        data-testid="search-alert-done"
        role="status"
        icon={<Check className="size-8" aria-hidden="true" />}
        title={t(`${page}.doneTitle`)}
        description={corps}
        action={
          <LienLocalise href="/properties" className={buttonVariants({ variant: 'outline' })}>
            {t('backToSearch')}
          </LienLocalise>
        }
      />
    );
  }

  async function agir() {
    if (!action) return;
    setEtat('working');
    try {
      if (action.kind === 'confirm') await confirmPublicSearchAlert({ token: action.token });
      else if (action.kind === 'contact') await unsubscribePublicSearchAlert(action.token);
      else await unsubscribeAccountSearch(action.link);
      setEtat('done');
    } catch (err) {
      // 422 : jeton inconnu, servi ou expiré ; 403 : signature fausse ou expirée ; 404 : la
      // recherche n'existe plus. Tous disent la même chose à la personne : ce lien ne sert plus.
      const status = err instanceof ApiError ? err.status : 0;
      setEtat(status === 422 || status === 403 || status === 404 ? 'invalid' : 'error');
    }
  }

  const corps =
    action.kind === 'confirm'
      ? t('confirm.body')
      : action.kind === 'contact'
        ? t('unsubscribe.bodyContact')
        : t('unsubscribe.bodyAccount');
  const Icone = action.kind === 'confirm' ? BellRing : BellOff;

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Icone className="size-6 text-primary" aria-hidden="true" />
      </div>
      <p className="mb-6 text-sm text-pretty bg-card text-muted-foreground">{corps}</p>
      <Button type="button" onClick={() => void agir()} disabled={etat === 'working'} className="min-h-11 w-full sm:w-auto">
        {etat === 'working' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {etat === 'working' ? t(`${page}.working`) : t(`${page}.button`)}
      </Button>
      {etat === 'error' ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {t('error')}
        </p>
      ) : null}
    </div>
  );
}
