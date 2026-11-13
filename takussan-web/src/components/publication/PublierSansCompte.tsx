'use client';

import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { autoOnboardAction } from '@/app/actions/auto-onboard';
import { useConnexionParTelephone } from '@/components/auth/useConnexionParTelephone';
import { DeclarerEntree } from '@/components/entree/CoqueDEntree';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ListeDesEspaces } from '@/components/publication/ListeDesEspaces';
import type { ContactSurPlace } from '@/components/contact/ContactsSurPlace';
import { AssistantDePublication, type ModeAnonyme } from '@/components/property-form/PropertyWizard';
import { useAuth } from '@/context/AuthContext';
import { fetchProfilesViaProxy, profilesKeys, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { espacesDePublication, PUBLISH_TARGETS, type EspaceDePublication } from '@/hooks/usePublishIntent';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { useEquipementsApprouves } from '@/lib/queries/referentiel-public';
import { CLE_BROUILLON_DE_PUBLICATION, LIEN_DE_REPRISE, verserAuBrouillonServeur } from '@/lib/publication/brouillon-de-publication';
import { valeursDeLAnnonce, type BrouillonLocal } from '@/lib/publication/brouillon-local';
import { useBrouillonLocal } from '@/lib/publication/useBrouillonLocal';
import { Button } from '@/components/ui/button';
import type { PropertyFormPayload, PropertyFormValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';

/**
 * TCK-2600 (ADR-0093) — `/publish` sans compte : l'assistant entier, son brouillon gardé dans ce
 * navigateur, et AUCUNE écriture serveur. Ne lit que des routes publiques : le référentiel
 * géographique, les équipements approuvés (`/api/public/amenities`) et la position collée
 * (`/api/public/geo/resolve-link`, TCK-2599).
 *
 * « Publier » valide l'annonce et la remet à `surPublier` : la feuille de compte (TCK-2601). Le
 * brouillon reste jusqu'à la publication réussie (ADR-0093 § 5).
 */

/**
 * La fin du parcours sans compte : ce que « Publier » remet à la feuille de compte (TCK-2601).
 *
 * Le brouillon est ÉCRIT avant qu'elle s'ouvre (un onglet fermé pendant le code SMS rouvre l'annonce
 * entière), et ne s'efface que sur SA demande : après la publication réussie, jamais avant — une
 * publication refusée (quota, second facteur, choix d'espace) garde l'annonce (ADR-0093 § 5).
 */
export interface AnnonceAPublier {
  readonly valeurs: PropertyFormPayload;
  /** Déjà réduites, à l'ajout (ADR-0093 § 2). */
  readonly photos: readonly File[];
  /** Jamais au brouillon (ADR-0093 § 6) : ils n'existent que là, le temps de la page. */
  readonly contacts: readonly ContactSurPlace[];
  readonly effacerLeBrouillon: () => Promise<void>;
}

/**
 * TCK-2608 — la porte pro du site : après la connexion, l'orientation ouvre d'emblée l'écran du professionnel
 * (`?etape=pro` : créer son agence ou en rejoindre une) ; `/onboarding/agency-admin` n'est plus l'entrée.
 */
const LIEN_PRO = '/auth/login?redirect=%2Fonboarding%2Fintention%3Fetape%3Dpro';
/** Un brouillon commencé connecté se reprend dans l'assistant connecté : `/publish` y mène. */
const LIEN_CONNEXION = '/auth/login?redirect=%2Fpublish&intention=publication';

// L'encre du lien reste opaque au survol (garde encre-sans-alpha) : c'est le soulignement qui s'affirme,
// comme « Utiliser plutôt mon numéro » de la voie e-mail.
const LIEN = 'font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary';

export function PublierSansCompte({
  surPublier,
  brouillonLocal,
}: {
  /** La feuille de compte (TCK-2601). Absente : la connexion, comme avant, le brouillon restant ici. */
  readonly surPublier?: (annonce: AnnonceAPublier) => void | Promise<void>;
  /** Le stockage du brouillon : IndexedDB par défaut ; un moteur en mémoire pour les tests. */
  readonly brouillonLocal?: () => BrouillonLocal;
}) {
  const t = useTranslations('publishRedirect.sansCompte');
  const tPage = useTranslations('publishRedirect');
  const tFeuille = useTranslations('property.wizard.feuille');
  // TCK-2600 — dès 1280 px (maquette a-0 à a-5), « Effacer ce brouillon » passe dans la barre, à côté
  // de « Brouillon gardé dans ce navigateur » : la ligne d'état sous la barre, que la maquette n'a
  // pas, descendait la question de 40 px. Un seul bouton à la fois (jamais deux « Effacer »).
  const large = useMatchesMedia('(width >= 80rem)');
  const router = useRouter();
  const brouillon = useBrouillonLocal<Partial<PropertyFormValues>>(brouillonLocal);
  const equipements = useEquipementsApprouves();
  const entreeParTelephone = useConnexionParTelephone();
  const queryClient = useQueryClient();
  const basculer = useSwitchActiveProfile();
  const { refreshUser } = useAuth();
  const [pas, setPas] = useState(1);
  const [total, setTotal] = useState(6);
  const [efface, setEfface] = useState(false);
  // TCK-2601 (AC5) — feuille de compte ouverte ou écritures en cours (`surVerrou` de l'assistant).
  const [verrouille, setVerrouille] = useState(false);
  // Un brouillon effacé remonte l'assistant : il repart vide, à l'étape 1.
  const [generation, setGeneration] = useState(0);
  /** TCK-2601 (AC3) — plusieurs espaces : l'annonce est versée, la personne choisit où la reprendre. */
  const [choix, setChoix] = useState<readonly EspaceDePublication[] | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [echecChoix, setEchecChoix] = useState(false);

  const tags: Tag[] = (equipements.data?.data ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    slug: e.slug,
    type: 'amenity',
    icon: null,
    color: null,
    description: null,
    status: 'approved',
  }));

  const memoire = brouillon.stockage.persistance === 'memoire';
  const etatDuBrouillon = memoire ? t(brouillon.stockage.raison === 'quota' ? 'brouillon.quota' : 'brouillon.refus') : null;

  /**
   * TCK-2601 — l'espace où publier, rejugé à chaque tentative sur les espaces RELUS (un espace créé à
   * la première tentative ne se recrée pas à la seconde) :
   * - aucun → créé sans question (`auto-onboard`, drapeau serveur `host_auto_space`) ; le cookie du
   *   profil actif est posé par l'action, et le bien naît dans cet espace (mesuré le 2026-11-13) ;
   *   — le drapeau éteint (`disabled`) mène à l'assistant hôte, l'annonce restant dans ce navigateur ;
   * - un seul, particulier (`individual`) où l'on n'est pas que bailleur → rendu actif s'il ne l'est pas ;
   * - sinon (agence `standard`, plusieurs espaces, bailleur seul) : jamais publié d'ici (AC3). L'annonce
   *   est VERSÉE au brouillon serveur, sous sa clé (`property-create-wizard:publication`), et l'assistant
   *   connecté la reprend à cette étape, avec ce que l'agence demande en plus (bailleur, frais, quota,
   *   proposition). Un refus (20 brouillons, 256 Ko) se dit, et l'annonce reste ici.
   */
  async function preparerLEspace(
    valeurs: Partial<PropertyFormValues>,
    etape: number,
  ): Promise<'pret' | 'ailleurs' | { readonly erreur: string }> {
    const profils = await queryClient.fetchQuery({ queryKey: profilesKeys.all, queryFn: fetchProfilesViaProxy, staleTime: 0 });
    const espaces = espacesDePublication(profils.data);
    if (espaces.length === 0) {
      const r = await autoOnboardAction();
      if (r.ok) {
        await refreshUser();
        await queryClient.invalidateQueries({ queryKey: profilesKeys.all });
        return 'pret';
      }
      if (r.reason === 'disabled') {
        router.push(PUBLISH_TARGETS.hostWizard);
        return 'ailleurs';
      }
      if (r.reason === 'failed') return { erreur: r.message };
      return { erreur: t('espace.indisponible') };
    }
    const [seul] = espaces;
    if (!seul) return { erreur: t('espace.indisponible') };
    if (espaces.length === 1 && seul.profile.agency?.kind === 'individual' && seul.profile.type !== 'owner') {
      if (profils.meta?.active_profile_id !== seul.profile.id) {
        try {
          await basculer.mutateAsync(seul.profile.id);
        } catch {
          return { erreur: t('espace.bascule') };
        }
      }
      return 'pret';
    }
    // Ni l'onglet ni la mémoire de la page ne passent la navigation : le serveur, si.
    // TCK-2601 (r1) — UNE fois : le versement réussi marque le brouillon local (sans l'effacer, les
    // photos n'existent que là). Une page revenue par « Précédent » ne reverse pas par-dessus ce qui a
    // été saisi depuis dans l'assistant connecté : elle mène au même endroit.
    if (!brouillon.verse) {
      const verse = await verserAuBrouillonServeur(etape, valeursDeLAnnonce(valeurs));
      if (!verse.ok) return { erreur: t(`espace.${verse.raison}`) };
      await brouillon.marquerVerse(CLE_BROUILLON_DE_PUBLICATION);
    }
    if (espaces.length > 1) {
      setChoix(espaces);
      return 'ailleurs';
    }
    return (await ouvrirLEspace(seul, profils.meta?.active_profile_id ?? null)) ? 'ailleurs' : { erreur: t('espace.bascule') };
  }

  /** Rend l'espace actif s'il ne l'est pas, puis ouvre l'assistant connecté sur l'annonce versée. */
  async function ouvrirLEspace(espace: EspaceDePublication, actif: string | null): Promise<boolean> {
    if (actif !== espace.profile.id) {
      try {
        await basculer.mutateAsync(espace.profile.id);
      } catch {
        return false;
      }
    }
    router.push(LIEN_DE_REPRISE);
    return true;
  }

  async function choisir(espace: EspaceDePublication) {
    setEchecChoix(false);
    setChoisi(espace.profile.id);
    if (!(await ouvrirLEspace(espace, null))) {
      setEchecChoix(true);
      setChoisi(null);
    }
  }

  const anonyme: ModeAnonyme = {
    entreeParTelephone,
    preparerLEspace,
    photosInitiales: brouillon.photos,
    surPhotos: brouillon.ecrirePhotos,
    surPublier: async (valeurs, photos, contacts) => {
      await brouillon.flush();
      if (!surPublier) {
        router.push(LIEN_CONNEXION);
        return;
      }
      await surPublier({
        valeurs,
        photos,
        contacts,
        effacerLeBrouillon: async () => {
          await brouillon.clear();
        },
      });
    },
    surVerrou: setVerrouille,
    surEtape: (index, nombre) => {
      setPas(index + 1);
      setTotal(nombre);
    },
    depart: {
      titre: t('depart.titre'),
      sousTitre: t('depart.sousTitre'),
      dessous: (
        <div className="space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
          <p>
            {t('depart.pro')}{' '}
            <NextLink href={LIEN_PRO} className={LIEN}>
              {t('depart.proLien')}
            </NextLink>
          </p>
          <p>
            {t('depart.reprise')}{' '}
            <NextLink href={LIEN_CONNEXION} className={LIEN}>
              {t('depart.repriseLien')}
            </NextLink>
          </p>
        </div>
      ),
    },
    // TCK-2600 — la note du pied, sous l'aperçu (maquette a-0 à a-5, dès `lg`).
    noteDuPied: (etape) =>
      etape === 'finition' ? (
        // Maquette a-5 : la phrase des conditions garde sa taille de partout (`PhraseCGU` : 12 px, 1,625).
        <span className="block text-xs leading-relaxed">
          {tFeuille.rich('mention', {
            terms: (morceau) => (
              <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" rel="noopener" className="underline underline-offset-2">
                {morceau}
              </LienLocalise>
            ),
            privacy: (morceau) => (
              <LienLocalise href={ROUTES_LEGALES.privacy} target="_blank" rel="noopener" className="underline underline-offset-2">
                {morceau}
              </LienLocalise>
            ),
          })}
        </span>
      ) : etape === 'prix' ? (
        t('brouillon.pied')
      ) : etape === 'bien' || etape === 'lieu' || etape === 'caracteristiques' || etape === 'photos' ? (
        t(`pied.${etape}`)
      ) : null,
    finition: (
      <>
        {/*
          Sous les contacts sur place : ADR-0093 n'admet au brouillon « ni numéro, ni prénom, ni nom » —
          ceux d'un gardien ou d'un voisin moins que tout autre. Ils restent le temps de la page, et
          l'écran le dit (décision du 2026-11-13).
        */}
        <p className="text-xs text-muted-foreground">{t('finition.contacts')}</p>
        <p className="flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent/10 px-3.5 py-3 text-sm leading-snug text-foreground">
          <Check className="mt-0.5 size-4 flex-none text-accent" strokeWidth={2.5} aria-hidden="true" />
          <span>
            <span className="font-semibold">{t('finition.fort')}</span> {t('finition.texte')}{' '}
            <NextLink href={LIEN_CONNEXION} className={LIEN}>
              {t('finition.lien')}
            </NextLink>
          </span>
        </p>
      </>
    ),
    pourPublierEnPlus: { libelle: t('numero.libelle'), note: t('numero.note') },
  };

  async function effacer() {
    await brouillon.clear();
    setEfface(true);
    setGeneration((g) => g + 1);
  }

  const effacerLeBrouillon = (
    <button
      type="button"
      // TCK-2601 (AC5) — pas d'effacement sous le panneau de compte ni pendant les écritures.
      disabled={verrouille}
      onClick={() => void effacer()}
      className="ml-auto min-h-11 flex-none underline underline-offset-4 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 xl:ml-0"
    >
      {t('brouillon.effacer')}
    </button>
  );

  return (
    <>
      <DeclarerEntree
        pleinEcran
        sortieBloquee={verrouille}
        pas={pas}
        total={total}
        noteDeBarre={
          <span className="hidden items-center gap-1.5 text-ui text-muted-foreground xl:flex">
            <Check className="size-3.5 text-accent" strokeWidth={2.5} aria-hidden="true" />
            <span>{memoire ? etatDuBrouillon : t('brouillon.navigateur')}</span>
            {large && brouillon.aDuContenu ? (
              <>
                <span aria-hidden="true">·</span>
                {effacerLeBrouillon}
              </>
            ) : null}
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col" data-publier-sans-compte="">
        {/*
          L'état du brouillon, sous la barre : au téléphone (« sur ce téléphone »), et jusqu'à 1280
          (« dans ce navigateur ») — la note de la barre ne paraît qu'au bureau large. « Effacer ce
          brouillon » s'y range à toute largeur : dans le flux, sous l'assistant, il remontait le
          pied de 52 px dès la première photo (relevé à 390, TCK-2600).
        */}
        <div className="flex min-h-11 flex-none items-center gap-x-4 px-4 text-xs text-muted-foreground sm:px-8 xl:hidden">
          <p className="flex min-w-0 items-center gap-1.5 xl:hidden">
            {memoire ? (
              etatDuBrouillon
            ) : (
              <>
                <Smartphone className="size-3.5 flex-none lg:hidden" strokeWidth={1.75} aria-hidden="true" />
                <Check className="hidden size-3.5 flex-none text-accent lg:block" strokeWidth={2.5} aria-hidden="true" />
                <span className="lg:hidden">{t('brouillon.telephone')}</span>
                <span className="hidden lg:inline">{t('brouillon.navigateur')}</span>
              </>
            )}
          </p>
          {brouillon.aDuContenu && !large ? effacerLeBrouillon : null}
        </div>
        {memoire ? (
          <p role="status" className="sr-only">
            {etatDuBrouillon}
          </p>
        ) : null}
        {brouillon.purge && !efface ? (
          <p role="status" className="flex-none px-4 pt-2 text-xs text-muted-foreground sm:px-8">
            {t('brouillon.purge')}
          </p>
        ) : null}
        {efface ? (
          <p role="status" className="flex-none px-4 pt-2 text-xs text-muted-foreground sm:px-8">
            {t('brouillon.efface')}
          </p>
        ) : null}
        <div className="min-h-0 flex-1">
          {choix ? (
            <section className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:px-0" data-testid="choix-de-l-espace">
              <div className="space-y-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{tPage('choose.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('choix.note')}</p>
              </div>
              <ListeDesEspaces espaces={choix} choisi={choisi} onChoisir={(e) => void choisir(e)} />
              {echecChoix ? (
                <p role="alert" className="text-sm text-destructive">
                  {tPage('choose.error')}
                </p>
              ) : null}
              <Button type="button" variant="ghost" className="self-start" disabled={choisi !== null} onClick={() => setChoix(null)}>
                {t('choix.revenir')}
              </Button>
            </section>
          ) : brouillon.isLoading ? null : (
            <AssistantDePublication key={generation} tags={tags} fraisDAgence={false} brouillon={brouillon} anonyme={anonyme} />
          )}
        </div>
      </div>
    </>
  );
}
