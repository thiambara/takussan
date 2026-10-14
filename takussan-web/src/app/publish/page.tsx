'use client';

/**
 * TCK-254, refondu par TCK-625 — `/publish`, l'arrivée du bouton « Publier ».
 *
 * La page applique la décision de `usePublishIntent()` : elle mène ailleurs (connexion, assistant
 * hôte, formulaire du bien) ou, quand la personne publie dans plusieurs agences, lui fait CHOISIR
 * l'espace — ici, sans détour. Le profil choisi devient actif avant le formulaire : c'est lui qui
 * décide dans quelle agence le bien est créé.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronRight, Home, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { BarreDeMarque } from '@/components/brand/BarreDeMarque';
import { Button } from '@/components/ui/button';
import { autoOnboardAction } from '@/app/actions/auto-onboard';
import { useAuth } from '@/context/AuthContext';
import { profilesKeys, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { PUBLISH_TARGETS, usePublishIntent, type EspaceDePublication } from '@/hooks/usePublishIntent';

export default function PublishPage() {
  const t = useTranslations('publishRedirect');
  const tTypes = useTranslations('profile.types');
  const router = useRouter();
  const decision = usePublishIntent();
  const basculer = useSwitchActiveProfile();
  const [echec, setEchec] = useState(false);
  const [choisi, setChoisi] = useState<string | null>(null);
  const parti = useRef(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [echecCreation, setEchecCreation] = useState<string | null>(null);
  // Dérivé, pas un état : l'effet qui lance la création ne pose rien de façon synchrone.
  const creation = decision.status === 'host-needed';

  /**
   * TCK-633 (lot C) — aucun espace où publier : on le crée sans question, puis on ouvre le
   * formulaire. Le SERVEUR arbitre le drapeau `host_auto_space` : `disabled` (403) reprend
   * l'assistant actuel, intact.
   */
  function creerPuisPartir(): Promise<void> {
    // Un rappel de promesse, pas un corps `async` : l'état ne change qu'à la réponse du serveur.
    return autoOnboardAction(user?.preferences?.city ?? null).then(async (r) => {
      if (r.ok) {
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
    if (!decision.target || parti.current || decision.status === 'host-needed') return;
    parti.current = true;
    void partir(decision.target, decision.profilABasculer);
    // `partir` n'a d'autre dépendance que la décision : une seule navigation par décision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.target, decision.profilABasculer, decision.status]);

  // TCK-633 (lot C) — un effet à part pour l'espace créé sans question : une seule création par
  // décision, et l'effet de navigation ci-dessus reste tel qu'il était.
  useEffect(() => {
    if (decision.status !== 'host-needed' || parti.current) return;
    parti.current = true;
    void creerPuisPartir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision.status]);

  function choisir(espace: EspaceDePublication) {
    setChoisi(espace.profile.id);
    void partir(PUBLISH_TARGETS.newProperty, espace.profile.id);
  }

  return (
    // TCK-621 — un écran de passage, mais qu'on voit : il porte la marque comme ses voisins.
    <div className="flex min-h-dvh flex-col bg-background">
      <BarreDeMarque />
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        {decision.status === 'choose-space' ? (
          <section className="flex w-full max-w-md flex-col gap-6">
            <div className="space-y-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                {t('choose.title')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('choose.body')}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {decision.espaces.map((espace) => {
                const personnel = espace.profile.agency?.kind === 'individual';
                const Icone = personnel ? Home : Building2;
                return (
                  <li key={espace.agencyId}>
                    <button
                      type="button"
                      onClick={() => choisir(espace)}
                      disabled={choisi !== null}
                      className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                    >
                      <Icone className="size-5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {personnel ? t('choose.personal') : (espace.profile.agency?.name ?? t('choose.unnamed'))}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {tTypes(espace.profile.type)}
                        </span>
                      </span>
                      {choisi === espace.profile.id ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
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
      </main>
    </div>
  );
}
