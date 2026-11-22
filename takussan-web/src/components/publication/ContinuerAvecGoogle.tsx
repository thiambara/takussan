'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { GoogleIcon } from '@/components/auth/IconeGoogle';
import { memoriserIntentionOAuth } from '@/components/auth/intention-oauth';
import { oauthProviders, oauthRedirect } from '@/lib/auth';
import { DESTINATION_REPRISE_COMPTE } from '@/lib/publication/reprise-oauth';
import { cn } from '@/lib/utils';

/**
 * TCK-2777 — « Continuer avec Google » dans la feuille de compte de `/publish` (maquette a-6) : une
 * ligne discrète de 44 px, sous « Recevoir un code » au téléphone, à côté du geste dans le panneau du
 * bureau.
 *
 * - **Absente** si Google n'est pas `configured`, ou si la liste des fournisseurs ne se charge pas :
 *   retirée sans un mot, comme à la porte (`AutresVoies`, TCK-2604). Le numéro reste la voie.
 * - **Le départ** : l'annonce est d'abord écrite dans ce navigateur (`avantLeDepart` — elle n'en sort
 *   pas, ADR-0093), puis la destination `/publish?reprise=compte` est mémorisée dans l'onglet
 *   (`memoriserIntentionOAuth`, TCK-589) : c'est elle qui ramène sur l'annonce, la feuille rouverte.
 *   Un départ refusé par l'API se dit par `surEchec` ; l'annonce reste là.
 *
 * ⚠ Un bouton nu, pas `Button` : le panneau du bureau élargit tout `[data-slot=button]` de sa rangée
 * à 220 px (`CadreDeLaFeuille`), et cette ligne n'est pas le geste.
 */
interface ContinuerAvecGoogleProps {
  /** Une écriture est en cours (ou le départ lui-même) : la ligne attend. */
  readonly occupe: boolean;
  /** Écrit l'annonce dans ce navigateur ; `false` : elle ne survivrait pas au départ, on reste. */
  readonly avantLeDepart: () => Promise<boolean>;
  /** Le départ commence (`true`) ou retombe (`false`) : la feuille se fige le temps qu'il part. */
  readonly surDepart: (enCours: boolean) => void;
  readonly surEchec: (message: string) => void;
  readonly className?: string;
}

export function ContinuerAvecGoogle({ occupe, avantLeDepart, surDepart, surEchec, className }: ContinuerAvecGoogleProps) {
  const tOAuth = useTranslations('auth.oauth');
  const [configure, setConfigure] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    let annule = false;
    // `then` d'abord : une panne SYNCHRONE de l'appel est retirée comme une autre.
    Promise.resolve()
      .then(() => oauthProviders())
      .then((liste) => {
        if (!annule) setConfigure(liste.some((p) => p.provider === 'google' && p.configured));
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, []);

  // Revenu par « Précédent » depuis chez Google (le sélecteur de compte n'a pas d'« Annuler ») : une
  // page rendue par le cache d'historique garde la feuille figée au départ. On la rend.
  useEffect(() => {
    const auRetour = (evenement: PageTransitionEvent) => {
      if (!evenement.persisted) return;
      setEnCours(false);
      surDepart(false);
    };
    window.addEventListener('pageshow', auRetour);
    return () => window.removeEventListener('pageshow', auRetour);
  }, [surDepart]);

  if (!configure) return null;

  async function partir() {
    setEnCours(true);
    surDepart(true);
    try {
      if (!(await avantLeDepart())) throw new Error('brouillon');
      const { redirect_url } = await oauthRedirect('google');
      memoriserIntentionOAuth(DESTINATION_REPRISE_COMPTE);
      window.location.assign(redirect_url);
    } catch {
      surEchec(tOAuth('startFailed'));
      setEnCours(false);
      surDepart(false);
    }
  }

  return (
    <button
      type="button"
      disabled={occupe || enCours}
      onClick={() => void partir()}
      data-continuer-avec-google=""
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
    >
      {enCours ? <Loader2 className="size-4 flex-none animate-spin" aria-hidden="true" /> : <GoogleIcon className="size-4 flex-none" />}
      {tOAuth('continueWith', { provider: 'Google' })}
    </button>
  );
}
