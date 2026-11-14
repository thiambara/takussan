'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useSwitchActiveProfile } from '@/hooks/useProfiles';
import { COOKIE_CHOIX_CLIENT, sigleDAgence, sousLigneDEspace } from '@/lib/espaces';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/profile';
import { profileTypeLabel } from './ProfileBadge';

interface ChoixDEspaceProps {
  /** Les espaces à proposer (`espacesAProposer`), dans l'ordre de l'API. Au moins deux agences. */
  readonly espaces: readonly Profile[];
  readonly prenom: string;
  readonly userId: number;
}

/**
 * TCK-2621 — « Dans quel espace travaillez-vous ? » : l'écran que voit, en arrivant sur `/app`, un compte
 * dont les profils couvrent plusieurs agences et que l'API n'a lié à aucun (ni cookie ni dernier espace
 * retenu, TCK-2620). Le layout de `/app` le rend À LA PLACE de la coque (`doitChoisirUnEspace`) : aucune
 * modale d'accueil ne s'ouvre dessous.
 *
 * - Téléphone : plein écran, une carte par espace (agence, « rôle · ville »), la case « Se souvenir de mon
 *   choix », l'action principale en bas.
 * - Bureau (dès `md`) : une carte centrée sur un fond `muted`, les espaces côte à côte.
 *
 * Choisir passe par le chemin unique de la bascule (`useSwitchActiveProfile`, ADR-0004) avec `remember` :
 * le relais pose le cookie, le routeur se rafraîchit, et le layout rend la coque de l'espace choisi.
 * « Continuer en tant que client » ne lie rien : il pose le témoin de session `COOKIE_CHOIX_CLIENT`, et
 * la question ne revient pas avant la session suivante.
 *
 * Chaque carte est un `<label>` autour d'un radio natif masqué (patron de `ChoiceCard`) : flèches,
 * boucle et un seul arrêt de tabulation viennent du navigateur.
 */
export function ChoixDEspace({ espaces, prenom, userId }: ChoixDEspaceProps) {
  const t = useTranslations('profile.choixDEspace');
  const tTypes = useTranslations('profile.types');
  const tCommun = useTranslations('common');
  const router = useRouter();
  const bascule = useSwitchActiveProfile();
  const [choisi, setChoisi] = useState(espaces[0]?.id ?? '');
  const [retenir, setRetenir] = useState(true);
  const [clientEnCours, setClientEnCours] = useState(false);
  const espaceChoisi = espaces.find((e) => e.id === choisi) ?? espaces[0];
  const nomDe = (p: Profile) => p.agency?.name ?? profileTypeLabel(p.type, tTypes);
  const occupe = bascule.isPending || bascule.isSuccess || clientEnCours;

  const continuer = () => {
    if (!espaceChoisi || occupe) return;
    bascule.mutate({ profileId: espaceChoisi.id, remember: retenir });
  };

  const continuerEnClient = () => {
    if (occupe) return;
    setClientEnCours(true);
    const securise = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_CHOIX_CLIENT}=${userId}; Path=/; SameSite=Lax${securise}`;
    router.refresh();
  };

  return (
    <main
      data-slot="choix-d-espace"
      className="flex min-h-dvh flex-col bg-background px-5 pb-8 pt-12 text-foreground md:items-center md:bg-muted/60 md:px-4 md:pt-24"
    >
      <Logo nom={tCommun('appName')} />
      <div className="flex flex-1 flex-col md:mt-6 md:w-full md:max-w-xl md:flex-none md:rounded-2xl md:border md:border-border md:bg-card md:p-7 md:shadow-carte-d-entree">
        <h1 className="mt-8 font-display text-2xl font-semibold leading-tight tracking-titre text-balance md:mt-0 md:leading-8">
          {t('titre')}
        </h1>
        <p className="mt-2 text-corps leading-relaxed text-muted-foreground md:text-sm md:leading-5">
          {prenom.trim()
            ? t('sousTitre', { prenom: prenom.trim(), count: espaces.length })
            : t('sousTitreSansPrenom', { count: espaces.length })}
        </p>

        <fieldset className="mt-6 grid gap-3 md:grid-cols-2">
          <legend className="sr-only">{t('legende')}</legend>
          {espaces.map((espace) => {
            const actif = espace.id === espaceChoisi?.id;
            const nom = nomDe(espace);
            return (
              <label
                key={espace.id}
                data-testid={`choix-d-espace-${espace.id}`}
                className={cn(
                  'relative flex cursor-pointer items-center gap-3.5 rounded-2xl border p-4 transition-colors md:flex-col md:items-start md:gap-0',
                  'has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring',
                  actif ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:bg-muted/40',
                )}
              >
                <input
                  type="radio"
                  name="espace"
                  value={espace.id}
                  checked={actif}
                  onChange={() => setChoisi(espace.id)}
                  disabled={occupe}
                  className="sr-only"
                />
                <SigleDEspace nom={nom} actif={actif} className="size-11 rounded-xl text-base md:text-sm" />
                <span className="min-w-0 flex-1 md:mt-3 md:w-full">
                  <span className="block truncate font-display text-titre-court font-semibold">{nom}</span>
                  <span className="block text-sm text-muted-foreground">
                    {sousLigneDEspace(profileTypeLabel(espace.type, tTypes), espace.agency?.city)}
                  </span>
                </span>
                <IndicateurDeChoix actif={actif} reduite className="md:absolute md:right-4 md:top-4" />
              </label>
            );
          })}
        </fieldset>

        <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-corps">
          <Checkbox checked={retenir} onCheckedChange={(v) => setRetenir(v === true)} disabled={occupe} />
          {t('seSouvenir')}
        </label>

        <div className="mt-auto flex flex-col pt-6 md:mt-4 md:flex-row-reverse md:items-center md:gap-4 md:pt-0">
          <Button
            type="button"
            size="xl"
            onClick={continuer}
            disabled={occupe || !espaceChoisi}
            className="w-full font-semibold md:h-controle md:w-auto md:text-sm"
          >
            {espaceChoisi ? t('continuerDans', { agence: nomDe(espaceChoisi) }) : null}
          </Button>
          <button
            type="button"
            onClick={continuerEnClient}
            disabled={occupe}
            className="mt-2 flex h-11 items-center justify-center rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60 md:mr-auto md:mt-0 md:h-auto"
          >
            {t('continuerClient')}
          </button>
        </div>
      </div>
    </main>
  );
}

/**
 * Le sigle de l'agence d'un espace — `primary` quand l'espace est retenu, le repli de l'avatar sinon
 * (`secondary` / `primary-deep`, 6,72:1). La maquette écrit `accent/15` + `text-accent` : sous 4,5:1, et
 * l'accent est réservé aux badges *featured* (`check-valeurs-arbitraires-app`, ADR-0106 § 2 a).
 */
export function SigleDEspace({ nom, actif, className }: { readonly nom: string; readonly actif: boolean; readonly className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex flex-none items-center justify-center font-display font-semibold',
        actif ? 'bg-primary text-primary-foreground' : 'bg-secondary text-primary-deep',
        className,
      )}
    >
      {sigleDAgence(nom)}
    </span>
  );
}

/**
 * La pastille de droite : pleine et cochée pour l'espace retenu, un cercle vide sinon. 24 px ; `reduite`
 * la passe à 20 px dès `md` (les cartes côte à côte de l'écran de choix, au bureau).
 */
export function IndicateurDeChoix({
  actif,
  reduite = false,
  className,
}: {
  readonly actif: boolean;
  readonly reduite?: boolean;
  readonly className?: string;
}) {
  return actif ? (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-6 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground',
        reduite && 'md:size-5',
        className,
      )}
    >
      <Check className={cn('size-3.5', reduite && 'md:size-3')} strokeWidth={2.5} />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={cn('size-6 flex-none rounded-full border border-controle-vide', reduite && 'md:size-5', className)}
    />
  );
}
