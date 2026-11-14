'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Mail } from 'lucide-react';

import { oauthProviders, oauthRedirect, type OAuthProvider } from '@/lib/auth';
import { cn } from '@/lib/utils';

import { memoriserIntentionOAuth } from './intention-oauth';
import { GoogleIcon } from './IconeGoogle';

/**
 * TCK-2604 — les deux autres voies sous le numéro (maquette `AutresVoies` au téléphone, `SuiteNumero`
 * au bureau) : « ou », le fournisseur s'il est configuré, l'e-mail.
 *
 * - Téléphone : une ligne de 44 px, « ou · Avec Google · Avec un e-mail » — elle ne pousse plus le
 *   bouton sous le clavier.
 * - Bureau : le séparateur « ou », « Continuer avec Google » en pleine largeur, puis « Utiliser un
 *   e-mail et un mot de passe » en lien.
 *
 * ⚠ **Un échec de chargement des fournisseurs RETIRE le bouton**, sans rien dire : ni silhouette
 * grise qui reste, ni « Impossible de charger les fournisseurs d'authentification ». Le numéro est
 * la voie affichée ; l'e-mail reste. Seul l'échec du DÉPART chez le fournisseur se dit.
 */
const FOURNISSEURS: readonly { readonly id: OAuthProvider; readonly nom: string }[] = [
  { id: 'google', nom: 'Google' },
  { id: 'apple', nom: 'Apple' },
  { id: 'facebook', nom: 'Facebook' },
];

const VOIE =
  'inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-input/45 bg-card px-0 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60 lg:w-full lg:flex-none lg:px-5 lg:text-corps lg:leading-normal';

export function AutresVoies({
  redirect,
  onEmail,
  className,
}: {
  readonly redirect: string | null;
  /** La voie e-mail ; absente quand c'est elle qui montre les autres voies (TCK-2606, numéro fermé). */
  readonly onEmail?: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('auth.porte');
  const tOAuth = useTranslations('auth.oauth');
  const [disponibles, setDisponibles] = useState<ReadonlySet<OAuthProvider>>(() => new Set());
  const [enCours, setEnCours] = useState<OAuthProvider | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    // `then` d'abord : une panne SYNCHRONE de l'appel est retirée comme une autre.
    Promise.resolve()
      .then(() => oauthProviders())
      .then((liste) => {
        if (!annule) setDisponibles(new Set(liste.filter((p) => p.configured).map((p) => p.provider)));
      })
      // Retiré, pas expliqué : le numéro et l'e-mail suffisent.
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, []);

  async function partir(fournisseur: OAuthProvider) {
    setErreur(null);
    setEnCours(fournisseur);
    try {
      const { redirect_url } = await oauthRedirect(fournisseur);
      memoriserIntentionOAuth(redirect);
      window.location.assign(redirect_url);
    } catch {
      setErreur(tOAuth('startFailed'));
      setEnCours(null);
    }
  }

  const fournisseurs = FOURNISSEURS.filter(({ id }) => disponibles.has(id));
  // Sans voie e-mail à proposer ni fournisseur configuré, il n'y a pas d'« autre voie » : pas de « ou » seul.
  if (!onEmail && fournisseurs.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-0">
        {/* « ou » : un mot au téléphone, un séparateur entre deux filets au bureau. */}
        <div className="flex items-center gap-3 pr-1 text-[13px] text-muted-foreground lg:mb-5 lg:pr-0">
          <span aria-hidden="true" className="hidden h-px flex-1 bg-border lg:block" />
          {t('ou')}
          <span aria-hidden="true" className="hidden h-px flex-1 bg-border lg:block" />
        </div>
        {fournisseurs.map(({ id, nom }) => (
          <button key={id} type="button" className={VOIE} disabled={enCours !== null} onClick={() => void partir(id)}>
            {enCours === id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : id === 'google' ? <GoogleIcon className="size-4 flex-none lg:size-[18px]" /> : null}
            <span className="truncate lg:hidden">{t('avec', { provider: nom })}</span>
            <span className="hidden truncate lg:inline">{tOAuth('continueWith', { provider: nom })}</span>
          </button>
        ))}
        {onEmail ? (
          <button
            type="button"
            onClick={onEmail}
            className={cn(
              VOIE,
              'lg:mt-1 lg:h-auto lg:min-h-11 lg:w-auto lg:text-sm lg:self-center lg:border-0 lg:bg-transparent lg:px-2 lg:font-medium lg:text-primary lg:underline lg:decoration-primary/40 lg:underline-offset-4 lg:hover:bg-transparent',
            )}
          >
            <Mail className="size-4 flex-none lg:hidden" strokeWidth={1.75} aria-hidden="true" />
            <span className="truncate lg:hidden">{t('avecEmail')}</span>
            <span className="hidden lg:inline">{t('utiliserEmail')}</span>
          </button>
        ) : null}
      </div>
      {erreur ? (
        <p className="mt-2 text-sm text-destructive text-center text-pretty" role="alert">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
