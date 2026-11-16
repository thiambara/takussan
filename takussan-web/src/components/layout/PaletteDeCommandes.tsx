'use client';

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useIsMutating } from '@tanstack/react-query';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/feedback';
import { profileTypeLabel } from '@/components/profile/ProfileBadge';
import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { useCurrentLocale } from '@/i18n/hooks';
import { hrefLocalise } from '@/i18n/navigation';
import { CLE_DE_BASCULE_D_ESPACE } from '@/lib/cache-d-espace';
import { espacesAProposer } from '@/lib/espaces';
import { lignesAujourdhui } from '@/lib/navigation/a-traiter';
import type { EntreeComposee } from '@/lib/navigation/composer-menu';
import { DISPOSITIONS } from '@/lib/navigation/dispositions';
import { lirePagesRecentes, type PageRecente } from '@/lib/navigation/pages-recentes';
import {
  GROUPES_DE_LA_PALETTE,
  avecLaRechercheDAnnonces,
  chercherDansLaPalette,
  decouperLesMots,
  optionsDeLaPalette,
  resolveurDesRecents,
  type GroupeDeLaPalette,
  type OptionDeLaPalette,
} from '@/lib/navigation/palette';
import { cn } from '@/lib/utils';
import { useCompteursDuMenu } from './useCompteursDuMenu';
import { useMenuDeLEspace } from './useMenuDeLEspace';
import { useRetenirLaPageRecente } from './usePaletteDeCommandes';
import { useSurApple } from './useSurApple';

/** La clé de titre de chaque groupe, sous `nav.palette.groupes`. */
const TITRES: Record<GroupeDeLaPalette, string> = {
  actions: 'actions',
  'a-traiter': 'aTraiter',
  'aller-a': 'allerA',
  recents: 'recents',
  espaces: 'espaces',
  annonces: 'annonces',
};

/**
 * A17 — les arguments du crochet qui compose LE menu de la barre, transmis tels quels : un champ que le
 * crochet gagne (`modulesMasques`, TCK-2483) atteint la palette sans qu'on y touche.
 */
type ContexteDuMenuDeLEspace = Parameters<typeof useMenuDeLEspace>[0];

interface PaletteDeCommandesProps {
  readonly contexteDuMenu: ContexteDuMenuDeLEspace;
  readonly ouverte: boolean;
  readonly onOuverteChange: (ouverte: boolean) => void;
  /** A7 — l'élément focalisé à l'ouverture ; absent ou retiré du DOM : le défaut de Base UI. */
  readonly retourDuFocus?: RefObject<HTMLElement | null>;
}

/**
 * TCK-2482 (ADR-0089) — la palette de commandes de `/app` : ⌘K / Ctrl K ou le bouton de la barre haute
 * (la coque, `AppShell`, tient l'état). `Dialog` de Base UI et motif ARIA combobox/listbox écrit à la
 * main, sur le patron de `GlobalSearch` (TCK-600) : le champ garde le focus, les flèches, Début et Fin
 * déplacent `aria-activedescendant`, Entrée ouvre, Échap ferme (Base UI).
 *
 * Son contenu n'est monté que palette ouverte : la composition du menu et les compteurs ne coûtent rien
 * palette fermée, et la saisie repart de zéro à chaque ouverture.
 */
export function PaletteDeCommandes({ ouverte, onOuverteChange, retourDuFocus, contexteDuMenu }: PaletteDeCommandesProps) {
  const t = useTranslations('nav.palette');
  const champ = useRef<HTMLInputElement>(null);
  // Revue I5 — fermée par un CHOIX (une page, une bascule d'espace) ? Posé par `choisir`, lu par
  // `finalFocus` : le patron `fermeParUnLien` du tiroir (TCK-2481). `finalFocus` est évalué à la
  // fermeture, AVANT que la navigation ne remplace la page : l'élément d'avant est encore là, et lui
  // rendre le focus rouvrait par exemple le panneau de la recherche de biens par-dessus la page choisie.
  // Consommé par `finalFocus`, appelé à CHAQUE fermeture : la suivante (Échap) rend de nouveau le focus.
  const fermeeParUnChoix = useRef(false);
  return (
    <Dialog open={ouverte} onOpenChange={(o) => onOuverteChange(o)}>
      <DialogContent
        data-slot="palette-de-commandes"
        initialFocus={champ}
        finalFocus={() => {
          if (fermeeParUnChoix.current) {
            fermeeParUnChoix.current = false;
            return false; // ne rien forcer : la page choisie prend la main
          }
          const element = retourDuFocus?.current ?? null;
          return element !== null && element.isConnected ? element : true;
        }}
        showCloseButton={false}
        // TCK-2845 — la maquette (app-coque e4) : sous `md`, la palette COUVRE l'écran (fond de page, ni
        // fenêtre ni coins) ; dès `md`, une fenêtre de 520 px (`w-130`) à 112 px du haut (`top-28`) sur
        // le voile. Les classes de base de `DialogContent` (centrage, marges, `sm:max-w-sm`) sont
        // neutralisées ici, `ui/dialog.tsx` n'en sait rien.
        className={cn(
          'inset-0 flex h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-background p-0 ring-0 sm:max-w-none',
          'md:inset-auto md:top-28 md:left-1/2 md:h-auto md:max-h-[calc(100dvh-var(--spacing)*36)] md:w-130 md:max-w-[calc(100%-var(--spacing)*8)] md:-translate-x-1/2 md:rounded-2xl md:border md:border-border md:bg-popover md:shadow-feuille',
        )}
      >
        <DialogTitle className="sr-only">{t('titre')}</DialogTitle>
        <DialogDescription className="sr-only">{t('description')}</DialogDescription>
        <ContenuDeLaPalette
          contexteDuMenu={contexteDuMenu}
          ouverte={ouverte}
          champ={champ}
          fermer={() => {
            fermeeParUnChoix.current = true;
            onOuverteChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface RetenirLaPageRecenteProps {
  readonly contexteDuMenu: ContexteDuMenuDeLEspace;
  readonly chemin: string | null;
}

/**
 * TCK-2482 (A8, revue I3) — retient la page visitée pour « Récents », dédoublonnée par entrée du MENU
 * RENDU : monté par la coque DANS `PreferencesDuMenuProvider`, il compose le menu comme la palette
 * (épingles comprises) et résout par la même fonction (`resolveurDesRecents`). Ne rend rien.
 */
export function RetenirLaPageRecente({ contexteDuMenu, chemin }: RetenirLaPageRecenteProps) {
  const { groupes } = useMenuDeLEspace(contexteDuMenu);
  useRetenirLaPageRecente(contexteDuMenu.user.id, contexteDuMenu.espaceActif, chemin, resolveurDesRecents(groupes));
  return null;
}

interface ContenuDeLaPaletteProps {
  readonly contexteDuMenu: ContexteDuMenuDeLEspace;
  /** A13 — le contenu survit à la fermeture le temps de l'animation : il ne sonde plus rien. */
  readonly ouverte: boolean;
  readonly champ: RefObject<HTMLInputElement | null>;
  /** Ferme APRÈS un choix : le focus n'est pas rendu (revue I5). Échap et le voile passent par Base UI. */
  readonly fermer: () => void;
}

/**
 * TCK-2619 — les options de la palette, sorties de son contenu pour que la page introuvable cherche dans
 * LE MÊME index (menu rendu, « Aujourd'hui », récents, espaces), sans en recomposer un second : la palette
 * ne juge aucun accès elle-même (S1, S2), la page introuvable non plus.
 */
export function useOptionsDeLaPalette(
  contexteDuMenu: ContexteDuMenuDeLEspace,
  { actif, recents }: { readonly actif: boolean; readonly recents: readonly PageRecente[] },
): OptionDeLaPalette[] {
  const t = useTranslations('nav.palette');
  const tMenu = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const tTypes = useTranslations('profile.types');
  const tRecents = useTranslations('nav.recents');
  const pathname = usePathname();
  // S1, S2 — LE menu de la barre et SES compteurs : la palette ne juge aucun accès elle-même, n'appelle
  // ni `composerMenu` ni `estOuverte` (gardes de TCK-2483, S8), et passe le contexte INTACT (A17).
  const { menu, groupes, entrees } = useMenuDeLEspace(contexteDuMenu);
  const compteurs = useCompteursDuMenu(entrees, { agencyIsStandard: contexteDuMenu.agencyIsStandard, actif });
  // TCK-2489 — les lignes « Aujourd'hui » de la barre, toutes (la palette n'a jamais coupé à quatre).
  const aTraiter = lignesAujourdhui(entrees, compteurs, menu.priorites);
  const profils = useMyProfiles();
  const actifId = profils.data?.meta.active_profile_id ?? null;

  const libelle = (e: EntreeComposee) => (e.labelSpace === 'nav.admin' ? tAdmin(e.labelKey) : tMenu(e.labelKey));
  return optionsDeLaPalette(
    {
      action: menu.action,
      carte: menu.carte,
      groupes,
      pastilles: aTraiter,
      espaces: espacesAProposer(profils.data?.data ?? [], actifId).filter((p) => p.id !== actifId),
      recents,
      pathname,
    },
    {
      entree: libelle,
      // Le libellé de la barre (`AppSidebar`) : la clé de la disposition (« Payer mon loyer »), sinon
      // celui de l'entrée.
      action: (e) => (DISPOSITIONS[menu.persona].libelleAction ? tMenu(`actions.${e.labelKey}`) : libelle(e)),
      carte: () => tMenu('carteLocation.titre'),
      // « Aussi … » sur le complément ; TCK-2845 — « Agence » sur une entrée du groupe Agence.
      precision: (g) =>
        (g.id === 'aussi' || g.titre === 'agence') && g.titre !== null ? tMenu(`groupes.${g.titre}`, g.titreValeurs) : null,
      epinglee: t('precisions.epinglee'),
      synonymes: (id) => (t.has(`synonymes.${id}`) ? decouperLesMots(t(`synonymes.${id}`)) : []),
      // TCK-2845 — le libellé sans le nombre (« Demandes non traitées ») : le nombre va en pastille.
      pastille: (p) => t(`aTraiterLignes.${p.cle}`),
      // TCK-2845 — « Basculer vers Agence Teranga », son rôle en précision (« Propriétaire ») ; sans
      // agence, le rôle EST le nom : il n'est pas répété.
      espace: (p) => t('basculerVers', { espace: p.agency?.name ?? profileTypeLabel(p.type, tTypes) }),
      roleDeLEspace: (p) => (p.agency?.name ? profileTypeLabel(p.type, tTypes) : null),
      motsEspace: decouperLesMots(t('synonymesEspace')),
      // TCK-2846 — « Bien », « Demande » : le type d'une fiche récente, en précision.
      typeDeFiche: (type) => tRecents(`types.${type}`),
    },
  );
}

function ContenuDeLaPalette({ contexteDuMenu, ouverte, champ, fermer }: ContenuDeLaPaletteProps) {
  const t = useTranslations('nav.palette');
  const tCommun = useTranslations('common.actions');
  const surApple = useSurApple();
  const router = useRouter();
  const locale = useCurrentLocale();
  const idListe = useId();
  const [saisie, setSaisie] = useState('');
  // Revue M1 — l'option active est retenue par sa CLÉ, pas par son rang : une pastille qui arrive (ou
  // disparaît) palette ouverte décale les rangs, jamais la cible d'Entrée. `null` : la première.
  const [cleActive, setCleActive] = useState<string | null>(null);
  // A8 — lus une fois par ouverture (le contenu est démonté à la fermeture).
  const [recents] = useState(() => lirePagesRecentes(contexteDuMenu.user.id, contexteDuMenu.espaceActif));
  const options = useOptionsDeLaPalette(contexteDuMenu, { actif: ouverte, recents });
  const bascule = useSwitchActiveProfile();
  // Revue M3 — une bascule en cours OÙ QU'ELLE AIT ÉTÉ LANCÉE (le sélecteur, avant ⌘K) : l'`isPending`
  // de cette instance, montée à l'ouverture, ne la voit pas. Les « Basculer vers » sont alors désactivés.
  const basculeEnCours = useIsMutating({ mutationKey: CLE_DE_BASCULE_D_ESPACE }) > 0;
  // TCK-2489 (ADR-0090 §2) — la recherche d'annonces du site public, que la barre du haut portait. Elle
  // suit toujours une saisie : « aucune page » n'est plus une liste vide, mais une liste qui n'a qu'elle.
  const pages = chercherDansLaPalette(options, saisie);
  const resultats = avecLaRechercheDAnnonces(pages, saisie, {
    generique: t('annonces.generique'),
    sitePublic: t('precisions.sitePublic'),
    avecTexte: (q) => t('annonces.avecTexte', { q }),
  });
  // Une clé disparue (compteur retombé à 0, saisie qui l'écarte) rend la main à la première option.
  const indexActif = resultats.length === 0 ? -1 : Math.max(0, resultats.findIndex((o) => o.cle === cleActive));
  const idOption = (index: number) => `${idListe}-option-${index}`;
  const requete = saisie.trim();
  const parGroupe = GROUPES_DE_LA_PALETTE.map((g) => [g, resultats.filter((o) => o.groupe === g)] as const).filter(
    ([, liste]) => liste.length > 0,
  );

  const choisir = (option: OptionDeLaPalette | undefined) => {
    if (!option) return;
    const cible = option.cible;
    // A12 — la chaîne du sélecteur de profil, sans un geste de plus (toast, `router.refresh()`, cache).
    if (cible.type === 'espace') {
      // Désactivée (revue M3) : ni seconde bascule concurrente, ni fermeture muette.
      if (basculeEnCours) return;
      bascule.mutate(cible.profilId);
    } else {
      // `hrefLocalise` et non `cheminLocalise` : la cible peut porter une requête (`/properties?q=…`).
      router.push(cible.publique ? hrefLocalise(cible.href, locale) : cible.href);
    }
    fermer();
  };

  const activer = (index: number) => {
    setCleActive(resultats[index]?.cle ?? null);
    document.getElementById(idOption(index))?.scrollIntoView?.({ block: 'nearest' });
  };
  const deplacer = (pas: 1 | -1) => {
    if (resultats.length === 0) return;
    activer((indexActif + pas + resultats.length) % resultats.length);
  };

  const surTouche = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      deplacer(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      deplacer(-1);
    } else if ((event.key === 'Home' || event.key === 'End') && resultats.length > 0) {
      // Début / Fin : la première ou la dernière option (le curseur du champ se déplace aux flèches
      // gauche et droite).
      event.preventDefault();
      activer(event.key === 'Home' ? 0 : resultats.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choisir(resultats[indexActif]);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* TCK-2845 — l'en-tête : la loupe dans le champ ; au téléphone un « ✕ » de 44 px nommé « Fermer »,
          au bureau la touche « Échap » (le ✕ du `Dialog` est retiré, `showCloseButton={false}`). */}
      <div className="flex flex-none items-center gap-1 border-b border-border/70 py-2 pr-1 pl-3 md:gap-3 md:border-border md:py-0 md:pr-4 md:pl-0">
        <div className="relative flex min-w-0 flex-1 items-center md:h-13">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground md:left-4"
            strokeWidth={1.5}
            aria-hidden
          />
          <Input
            ref={champ}
            role="combobox"
            aria-label={t('champ')}
            aria-expanded={resultats.length > 0}
            aria-controls={resultats.length > 0 ? idListe : undefined}
            aria-autocomplete="list"
            aria-activedescendant={indexActif >= 0 ? idOption(indexActif) : undefined}
            placeholder={t('placeholder')}
            value={saisie}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => {
              setSaisie(event.target.value);
              setCleActive(null);
            }}
            onKeyDown={surTouche}
            // Hauteur et texte de la primitive (TCK-2460 : 44 px et 16 px sous le pouce, iOS ne zoome pas).
            // Téléphone : un champ bordé ; bureau : le champ EST l'en-tête de la fenêtre (son conteneur fait
            // 52 px), sans bord ni anneau — le curseur et le filet du dessous le désignent.
            className="rounded-xl border-foreground/25 bg-card pl-11 md:rounded-none md:border-0 md:bg-transparent md:pl-12 md:focus-visible:ring-0"
          />
        </div>
        <DialogClose
          aria-label={tCommun('close')}
          className="inline-flex size-11 flex-none items-center justify-center rounded-lg text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring md:hidden"
        >
          <X className="size-5" aria-hidden />
        </DialogClose>
        <kbd className="hidden flex-none rounded bg-muted px-1.5 py-0.5 font-sans text-xs text-muted-foreground md:inline-block">
          {t('echap')}
        </kbd>
      </div>
      <p role="status" className="sr-only">
        {t('resultats', { count: resultats.length })}
      </p>
      {/* L'état vide unique du produit (`scripts/check-feedback-states.mjs`), allégé : la palette est
          déjà une surface, ni bordure pointillée ni grand padding. Hors de la listbox. TCK-2489 — il dit
          « aucune PAGE » : la recherche d'annonces, elle, est toujours proposée en dessous. */}
      {pages.length === 0 && requete !== '' ? (
        <EmptyState title={t('aucun', { q: requete })} className="rounded-none border-0 bg-transparent px-2 py-6" />
      ) : null}
      {resultats.length > 0 ? (
        <div
          id={idListe}
          role="listbox"
          aria-label={t('titre')}
          className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 md:max-h-[min(60dvh,var(--spacing)*112)] md:flex-none md:p-2"
        >
          {parGroupe.map(([groupe, liste], rangDuGroupe) => (
            <div key={groupe} role="group" aria-labelledby={`${idListe}-${groupe}`} className={cn(rangDuGroupe > 0 && 'mt-2')}>
              <div id={`${idListe}-${groupe}`} role="presentation" className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {t(`groupes.${TITRES[groupe]}`)}
              </div>
              {liste.map((option) => {
                const index = resultats.indexOf(option);
                const Icone = option.icone;
                const estActive = index === indexActif;
                const desactivee = option.cible.type === 'espace' && basculeEnCours;
                return (
                  <div
                    key={option.cle}
                    id={idOption(index)}
                    role="option"
                    // Focalisable par programme seulement, jamais par Tab : le focus reste au champ
                    // (motif combobox, `aria-activedescendant` désigne l'option). Patron de
                    // `SearchAutocomplete` : on choisit à l'appui, sans retirer le focus au champ.
                    tabIndex={-1}
                    aria-selected={estActive}
                    aria-disabled={desactivee || undefined}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choisir(option);
                    }}
                    onMouseMove={() => setCleActive(option.cle)}
                    // TCK-2845 — la ligne active de la maquette : un fond gris léger (`bg-muted`) ET
                    // l'icône ↵ à droite. L'aplat `bg-accent` de la revue I2 est retiré : le repère de ce
                    // qu'Entrée ouvre n'est plus la couleur seule, c'est ↵ (≥ 3:1 sur ce fond, mesuré dans
                    // `PaletteDeCommandes.test.tsx`). Lignes de 44 px au pouce, 36 px au bureau.
                    className={cn(
                      'flex h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-corps text-foreground md:h-9 md:text-sm',
                      estActive && 'bg-muted',
                      desactivee && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <Icone className="size-5 shrink-0 text-muted-foreground md:size-4" strokeWidth={1.5} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{option.libelle}</span>
                    {option.compte ? (
                      <span
                        data-slot="pastille"
                        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-semibold tabular-nums text-primary-deep"
                      >
                        {option.compte}
                      </span>
                    ) : null}
                    {option.precision ? (
                      <span className="shrink-0 truncate text-xs text-muted-foreground">{option.precision}</span>
                    ) : null}
                    {estActive ? (
                      <CornerDownLeft data-slot="entree" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
      {/* TCK-2845 — le pied de la maquette, au bureau seulement : les touches de la palette. */}
      <p
        data-slot="pied-de-la-palette"
        className="hidden flex-none items-center gap-4 border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground md:flex"
      >
        <span>
          <kbd className="rounded bg-card px-1 font-sans">↑</kbd> <kbd className="rounded bg-card px-1 font-sans">↓</kbd>{' '}
          {t('pied.naviguer')}
        </span>
        <span>
          <kbd className="rounded bg-card px-1 font-sans">↵</kbd> {t('pied.ouvrir')}
        </span>
        <span className="ml-auto">
          <kbd className="rounded bg-card px-1 font-sans">{surApple ? t('raccourciMac') : t('raccourciAutre')}</kbd>{' '}
          {t('pied.partout')}
        </span>
      </p>
    </div>
  );
}
