'use client';

/**
 * TCK-254, refondu par TCK-625 — `/publish`, l'arrivée du bouton « Publier ».
 *
 * La page applique la décision de `usePublishIntent()` : elle mène ailleurs (connexion, assistant
 * hôte, formulaire du bien) ou, quand la personne publie dans plusieurs agences, lui fait CHOISIR
 * l'espace — ici, sans détour. Le profil choisi devient actif avant le formulaire : c'est lui qui
 * décide dans quelle agence le bien est créé.
 *
 * TCK-2600 (ADR-0093) — SANS COMPTE, elle ne renvoie plus à la connexion : elle sert l'assistant,
 * son brouillon gardé dans ce navigateur (`PublierSansCompte`). Le compte naît à la publication
 * (TCK-2601), sans que la page ne démonte l'assistant ni ne décide plus rien.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ListeDesEspaces } from '@/components/publication/ListeDesEspaces';
import { PublierSansCompte } from '@/components/publication/PublierSansCompte';
import { autoOnboardAction } from '@/app/actions/auto-onboard';
import { useAuth } from '@/context/AuthContext';
import { profilesKeys, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { PUBLISH_TARGETS, usePublishIntent, type EspaceDePublication } from '@/hooks/usePublishIntent';
import { LIEN_DE_REPRISE } from '@/lib/publication/brouillon-de-publication';
import { useBrouillonLocalPresent } from '@/lib/publication/useBrouillonLocalPresent';

export default function PublishPage() {
  const t = useTranslations('publishRedirect');
  const router = useRouter();
  const decision = usePublishIntent();
  const basculer = useSwitchActiveProfile();
  const { refreshUser } = useAuth();
  const [echec, setEchec] = useState(false);
  const [choisi, setChoisi] = useState<string | null>(null);
  const parti = useRef(false);
  const queryClient = useQueryClient();
  const [echecCreation, setEchecCreation] = useState<string | null>(null);
  // Dérivé, pas un état : l'effet qui lance la création ne pose rien de façon synchrone.
  const creation = decision.status === 'host-needed';

  /**
   * TCK-2601 — l'assistant sans compte reste monté quand la session s'ouvre SUR cette page (la feuille
   * de compte) : la décision passe alors par « chargement », « aucun espace »… et la page ne la suit
   * plus — c'est l'assistant qui publie. Un visiteur qui ARRIVE connecté avec une annonce gardée dans ce
   * navigateur la retrouve de même. La page n'agit qu'une fois le brouillon local lu.
   */
  const brouillonLocal = useBrouillonLocalPresent();
  const [assistantMonte, setAssistantMonte] = useState(false);
  if (decision.status === 'anonymous' && !assistantMonte) setAssistantMonte(true);
  /**
   * TCK-2601 (r1) — l'annonce gardée ici a déjà été VERSÉE au brouillon serveur (agence, plusieurs
   * espaces, bailleur seul) : elle se reprend dans l'assistant connecté. La page y mène sans rouvrir
   * l'assistant sans compte — revenue par « Précédent », elle en reverserait l'ancienne copie
   * par-dessus ce qui a été saisi depuis.
   */
  const verse = brouillonLocal === 'verse';
  const sansCompte = !verse && (assistantMonte || decision.status === 'anonymous' || brouillonLocal === true);
  const enAttente = sansCompte || brouillonLocal === null || verse;

  /**
   * TCK-633 (lot C) — aucun espace où publier : on le crée sans question, puis on ouvre le
   * formulaire. Le SERVEUR arbitre le drapeau `host_auto_space` : `disabled` (403) reprend
   * l'assistant actuel, intact.
   */
  function creerPuisPartir(): Promise<void> {
    // Un rappel de promesse, pas un corps `async` : l'état ne change qu'à la réponse du serveur.
    return autoOnboardAction().then(async (r) => {
      if (r.ok) {
        // TCK-2044 (P202.05) — l'espace ajoute deux profils au compte : comme l'assistant hôte, on
        // relit l'utilisateur (`roles`, `agency_id`) avant de partir.
        await refreshUser();
        await queryClient.invalidateQueries({ queryKey: profilesKeys.all });
        router.replace(PUBLISH_TARGETS.newProperty);
        return;
      }
      if (r.reason === 'disabled') {
        router.replace(PUBLISH_TARGETS.hostWizard);
        return;
      }
      if (r.reason === 'unauthenticated') {
        router.replace(PUBLISH_TARGETS.login);
        return;
      }
      setEchecCreation(r.message || t('auto.error'));
    });
  }

  async function partir(target: string, profil: string | null) {
    setEchec(false);
    if (profil) {
      try {
        await basculer.mutateAsync(profil);
      } catch {
        setEchec(true);
        setChoisi(null);
        parti.current = false;
        return;
      }
    }
    router.replace(target);
  }

  useEffect(() => {
    if (enAttente || !decision.target || parti.current || decision.status === 'host-needed' || decision.status === 'anonymous') return;
    parti.current = true;
    void partir(decision.target, decision.profilABasculer);
    // `partir` n'a d'autre dépendance que la décision : une seule navigation par décision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.target, decision.profilABasculer, decision.status, enAttente]);

  // TCK-633 (lot C) — un effet à part pour l'espace créé sans question : une seule création par
  // décision, et l'effet de navigation ci-dessus reste tel qu'il était.
  useEffect(() => {
    if (enAttente || decision.status !== 'host-needed' || parti.current) return;
    parti.current = true;
    void creerPuisPartir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.status, enAttente]);

  useEffect(() => {
    if (!verse || parti.current) return;
    parti.current = true;
    router.replace(LIEN_DE_REPRISE);
  }, [verse, router]);

  function choisir(espace: EspaceDePublication) {
    setChoisi(espace.profile.id);
    void partir(PUBLISH_TARGETS.newProperty, espace.profile.id);
  }

  if (sansCompte) return <PublierSansCompte />;

  return (
    // TCK-621 — un écran de passage, mais qu'on voit : il porte la marque comme ses voisins. Depuis
    // TCK-2598, la barre et le repère `<main>` sont ceux de la coque d'entrée (`layout.tsx`).
    <div className="flex justify-center">
      {decision.status === 'choose-space' && !verse ? (
        <section className="flex w-full max-w-md flex-col gap-6">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {t('choose.title')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('choose.body')}</p>
          </div>
          <ListeDesEspaces espaces={decision.espaces} choisi={choisi} onChoisir={choisir} />
          {echec ? (
            <p role="alert" className="text-sm text-destructive">
              {t('choose.error')}
            </p>
          ) : null}
        </section>
      ) : echecCreation ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p role="alert" className="max-w-sm text-sm text-destructive">
            {echecCreation}
          </p>
          <Button
            type="button"
            onClick={() => {
              setEchecCreation(null);
              void creerPuisPartir();
            }}
          >
            {t('retry')}
          </Button>
        </div>
      ) : echec ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p role="alert" className="max-w-sm text-sm text-destructive">
            {t('choose.error')}
          </p>
          <Button
            type="button"
            onClick={() => decision.target && void partir(decision.target, decision.profilABasculer)}
          >
            {t('retry')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {creation ? t('auto.title') : t('title')}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">{creation ? t('auto.body') : t('body')}</p>
        </div>
      )}
    </div>
  );
}
