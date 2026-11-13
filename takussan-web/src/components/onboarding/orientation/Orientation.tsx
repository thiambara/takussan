'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { TitreDEntree } from '@/components/auth/PiecesDuCourriel';
import { useAuth } from '@/context/AuthContext';
import type { EcranDOrientation } from '@/lib/orientation';
import type { EntryIntent } from '@/types/user';

import { DeclarerBarreDOrientation } from './BarreDOrientation';
import { EtapeChercheur } from './EtapeChercheur';
import { EtapePro, type CompteDuPro } from './EtapePro';
import { PortesDEntree, type Porte } from './PortesDEntree';

/**
 * TCK-2608 — l'orientation après la création du compte : TROIS portes, un geste (maquette
 * `app-entree-orientation`, approche a). La carte touchée EST la réponse, enregistrée aussitôt
 * (`PATCH /api/me`, `entry_intent`) :
 *
 *  · « J'ai un bien » → `publish`, puis `/publish` (AC1) — qui sait où mener ;
 *  · « Je cherche » → `search`, puis « Où et pour combien ? » (alerte et liste filtrée, AC2) ;
 *  · « Je suis un professionnel » → `professional`, puis « Votre agence sur Takussan » (AC3) ;
 *  · « Plus tard » → `skipped`, puis la destination demandée : passer s'enregistre (TCK-493).
 *
 * ⚠ **La réponse ORIENTE, elle n'attribue rien** (TCK-493, `MeUpdateTest`) : aucune carte ne crée de
 * profil. Seuls le bouton « Créer mon espace pro » (un espace individuel, `POST /api/host/individual/
 * onboard`) et « Voir les N biens » (une alerte) écrivent autre chose que la réponse — au geste,
 * jamais au toucher d'une carte.
 *
 * ⚠ Les deux écrans suivants sont des ÉTATS de cette page, MAIS l'écran courant est écrit dans l'URL
 * (`?etape=`, par `history.replaceState` : aucun aller-retour serveur). La page doit pouvoir les
 * REPRENDRE : l'ouverture de l'espace pose un cookie dans une server action, ce qui re-rend la page
 * côté serveur — réponse déjà écrite, elle aurait mené à `/app` au milieu de l'écran du professionnel
 * (`ecranAReprendre`, `lib/orientation.ts`). Un rechargement reprend au même écran.
 */
type Ecran = EcranDOrientation;

/** L'écran courant dans l'URL, sans navigation (Next synchronise `replaceState` avec son routeur). */
function marquerLEcran(ecran: Ecran) {
  const url = new URL(window.location.href);
  url.searchParams.set('etape', ecran);
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

const INTENTION: Record<Porte, Exclude<EntryIntent, 'skipped'>> = {
  chercher: 'search',
  publier: 'publish',
  pro: 'professional',
};

async function enregistrer(intent: EntryIntent): Promise<boolean> {
  const res = await fetch('/api/me', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry_intent: intent }),
  });
  return res.ok;
}

export interface OrientationProps {
  /** L'écran à montrer d'abord : les portes, ou celui que la page reprend (`?etape=`). */
  readonly ecranInitial?: Ecran;
  /**
   * La page ouvre l'écran du professionnel par la porte pro du site (`?etape=pro`) sans que la réponse
   * soit `professional` : elle s'écrit à l'ouverture, comme si la porte avait été choisie ici. Sans
   * elle, l'espace ouvert puis la page re-rendue (cookie posé) ne reprendrait plus l'écran.
   */
  readonly ecrireProfessionnel?: boolean;
  readonly prenom: string;
  /** La destination demandée (ou `/app`) : où mène « Plus tard ». */
  readonly apres: string;
  readonly marque: string;
  readonly quartiersSuggeres: readonly string[];
  /** Le numéro où WhatsApp préviendrait ; `null` : capacité fermée ou canal verrouillé. */
  readonly whatsapp: { readonly numero: string } | null;
  readonly compte: CompteDuPro;
}

export function Orientation({ ecranInitial = 'portes', ecrireProfessionnel = false, prenom, apres, marque, quartiersSuggeres, whatsapp, compte }: OrientationProps) {
  const t = useTranslations('onboarding.orientation');
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [ecran, setEcran] = useState<Ecran>(ecranInitial);

  // Une seule écriture, même sous le double montage du mode strict.
  const professionnelEcrit = useRef(false);
  useEffect(() => {
    if (!ecrireProfessionnel || professionnelEcrit.current) return;
    professionnelEcrit.current = true;
    void enregistrer('professional')
      .then((ok) => (ok ? refreshUser() : undefined))
      .catch(() => undefined);
  }, [ecrireProfessionnel, refreshUser]);

  function allerA(suivant: Ecran) {
    marquerLEcran(suivant);
    setEcran(suivant);
  }
  const [enCours, setEnCours] = useState<Porte | 'plus-tard' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function repondre(intent: EntryIntent, suite: () => void, quoi: Porte | 'plus-tard') {
    setErreur(null);
    setEnCours(quoi);
    const ok = await enregistrer(intent).catch(() => false);
    if (!ok) {
      setErreur(t('erreur'));
      setEnCours(null);
      return;
    }
    // Le `user` en mémoire porte `preferences` : sans ce rafraîchissement, un retour arrière
    // rouvrirait la question à quelqu'un qui vient d'y répondre (TCK-493).
    await refreshUser();
    setEnCours(null);
    suite();
  }

  function choisir(porte: Porte) {
    void repondre(
      INTENTION[porte],
      () => {
        if (porte === 'publier') router.replace('/publish');
        else allerA(porte === 'chercher' ? 'chercheur' : 'pro');
      },
      porte,
    );
  }

  const retour = () => allerA('portes');

  if (ecran === 'chercheur') {
    return <EtapeChercheur marque={marque} quartiersSuggeres={quartiersSuggeres} whatsapp={whatsapp} onRetour={retour} />;
  }
  if (ecran === 'pro') {
    return <EtapePro marque={marque} compte={compte} onRetour={retour} />;
  }

  return (
    <div>
      <DeclarerBarreDOrientation
        marque={marque}
        titre={t('compteCree')}
        pas={2}
        total={2}
        largeur="portes"
        action={{
          libelle: t('plusTard'),
          onClick: () => void repondre('skipped', () => router.replace(apres), 'plus-tard'),
          desactivee: enCours !== null,
        }}
      />
      <TitreDEntree sous={t('question')} className="lg:text-center">
        {t('titre', { prenom })}
      </TitreDEntree>
      <PortesDEntree onChoisir={choisir} enCours={enCours === 'plus-tard' ? null : enCours} fige={enCours === 'plus-tard'} />
      {erreur ? (
        <p role="alert" className="mt-4 text-sm text-destructive lg:text-center">
          {erreur}
        </p>
      ) : null}
      <p className="mt-6 text-center text-sm text-muted-foreground lg:mt-8">{t('lesTrois')}</p>
    </div>
  );
}
