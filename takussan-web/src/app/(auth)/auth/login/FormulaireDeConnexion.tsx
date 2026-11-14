'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { ConnexionParTelephone } from '@/components/auth/ConnexionParTelephone';
import type { IntentionAffichee } from '@/components/auth/IntentionDEntree';
import { VoieEmail, type OngletEmail } from '@/components/auth/VoieEmail';
import { intentionDeLUrl } from '@/components/auth/liens-de-l-entree';
import { useConnexionParTelephone } from '@/components/auth/useConnexionParTelephone';
import { avecRedirection } from '@/lib/redirection-interne';

const OAUTH_ERRORS = ['oauth_invalid', 'oauth_failed', 'oauth_unknown'] as const;

/**
 * Le formulaire de `/auth/login` — la page (serveur) lit l'intention et le bien quitté, et les lui
 * passe (TCK-2604).
 *
 * Deux voies, une seule affichée :
 * - **le numéro** (TCK-589, TCK-2604), en tête quand l'API le propose (`phone_login`) ;
 * - **l'e-mail** (TCK-2606, `VoieEmail`) : deux onglets, « J'ai un compte » et « Créer un compte ».
 *   Elle est la porte quand le numéro est fermé, et s'ouvre d'emblée sur `?voie=email` (retour de
 *   l'oubli, de la vérification), `?voie=inscription` (`/auth/register`, onglet « Créer ») et
 *   `?reset=1` (le mot de passe vient d'être changé : c'est lui qu'on va taper).
 */
export function FormulaireDeConnexion({ intention = null }: { readonly intention?: IntentionAffichee | null }) {
  const tPorte = useTranslations('auth.porte');
  const tLogin = useTranslations('auth.login');
  const router = useRouter();
  const searchParams = useSearchParams();
  const origine = intentionDeLUrl(searchParams);
  // Le filtre PARTAGÉ avec le retour OAuth et l'onboarding (TCK-493). TCK-624 — UNE porte de sortie
  // pour toutes les voies : `/onboarding/intention` juge ce qui manque encore, puis rend la main.
  const sortie = avecRedirection('/onboarding/intention', origine.redirect);
  const motDePasseModifie = searchParams.get('reset') === '1';
  // Le callback OAuth renvoie ici sur `?error=…` : un échec Google ne ramène plus sur un formulaire muet.
  const oauthError = OAUTH_ERRORS.find((code) => code === searchParams.get('error')) ?? null;
  const voie = searchParams.get('voie');
  const ongletInitial: OngletEmail = voie === 'inscription' ? 'creation' : 'connexion';
  const telephoneActif = useConnexionParTelephone();
  const [voieEmail, setVoieEmail] = useState(() => voie === 'email' || voie === 'inscription' || motDePasseModifie);

  if (telephoneActif && !voieEmail) {
    return (
      <ConnexionParTelephone
        // TCK-624 — compte neuf ou non, même porte : un compte ouvert par téléphone n'a pas de
        // prénom, et c'est elle qui le demande.
        onConnecte={() => router.push(sortie)}
        onEmail={() => setVoieEmail(true)}
        intention={intention}
        redirect={origine.redirect}
        // TCK-2604 — après un échec Google, le message propose la voie affichée : le numéro.
        erreurOAuth={oauthError ? tPorte(`oauthError.${oauthError}`) : null}
      />
    );
  }

  return (
    <VoieEmail
      intention={intention}
      redirect={origine.redirect}
      action={origine.action}
      ongletInitial={ongletInitial}
      onTelephone={telephoneActif ? () => setVoieEmail(false) : undefined}
      // Numéro fermé : le message propose l'e-mail, la voie affichée.
      erreurOAuth={oauthError ? (telephoneActif ? tPorte(`oauthError.${oauthError}`) : tLogin(`oauthError.${oauthError}`)) : null}
      motDePasseModifie={motDePasseModifie}
    />
  );
}
