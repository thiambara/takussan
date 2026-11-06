'use client';

import { useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/feedback';
import { profileShortLabel } from '@/components/profile/ProfileBadge';
import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { useCurrentLocale } from '@/i18n/hooks';
import { cheminLocalise } from '@/i18n/routing';
import { espacesAProposer } from '@/lib/espaces';
import { pastillesATraiter } from '@/lib/navigation/a-traiter';
import type { EntreeComposee } from '@/lib/navigation/composer-menu';
import { DISPOSITIONS } from '@/lib/navigation/dispositions';
import { lirePagesRecentes } from '@/lib/navigation/pages-recentes';
import {
  GROUPES_DE_LA_PALETTE,
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

/** La clé de titre de chaque groupe, sous `nav.palette.groupes`. */
const TITRES: Record<GroupeDeLaPalette, string> = {
  actions: 'actions',
  'a-traiter': 'aTraiter',
  recents: 'recents',
  'aller-a': 'allerA',
  espaces: 'espaces',
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
        className="top-[10vh] translate-y-0 gap-3 sm:max-w-xl"
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
  useRetenirLaPageRecente(contexteDuMenu.user.id, chemin, resolveurDesRecents(groupes));
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

function ContenuDeLaPalette({ contexteDuMenu, ouverte, champ, fermer }: ContenuDeLaPaletteProps) {
  const t = useTranslations('nav.palette');
  const tMenu = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const tTypes = useTranslations('profile.types');
  const router = useRouter();
  const pathname = usePathname();
  const locale = useCurrentLocale();
  const idListe = useId();
  const [saisie, setSaisie] = useState('');
  // Revue M1 — l'option active est retenue par sa CLÉ, pas par son rang : une pastille qui arrive (ou
  // disparaît) palette ouverte décale les rangs, jamais la cible d'Entrée. `null` : la première.
  const [cleActive, setCleActive] = useState<string | null>(null);
  // A8 — lus une fois par ouverture (le contenu est démonté à la fermeture).
  const [recents] = useState(() => lirePagesRecentes(contexteDuMenu.user.id));

  // S1, S2 — LE menu de la barre et SES compteurs : la palette ne juge aucun accès elle-même, n'appelle
  // ni `composerMenu` ni `estOuverte` (gardes de TCK-2483, S8), et passe le contexte INTACT (A17).
  const { menu, groupes, entrees } = useMenuDeLEspace(contexteDuMenu);
  const compteurs = useCompteursDuMenu(entrees, { agencyIsStandard: contexteDuMenu.agencyIsStandard, actif: ouverte });
  const bande = pastillesATraiter(entrees, compteurs, menu.priorites);
  const profils = useMyProfiles();
  const bascule = useSwitchActiveProfile();
  const actifId = profils.data?.meta.active_profile_id ?? null;

  const libelle = (e: EntreeComposee) => (e.labelSpace === 'nav.admin' ? tAdmin(e.labelKey) : tMenu(e.labelKey));
  const options = optionsDeLaPalette(
    {
      action: menu.action,
      carte: menu.carte,
      groupes,
      pastilles: [...bande.visibles, ...bande.autres],
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
      precision: (g) => (g.id === 'aussi' && g.titre !== null ? tMenu(`groupes.${g.titre}`, g.titreValeurs) : null),
      synonymes: (id) => (t.has(`synonymes.${id}`) ? decouperLesMots(t(`synonymes.${id}`)) : []),
      pastille: (p) => tMenu(`aTraiter.noms.${p.cle}`, { count: p.nombre }),
      espace: (p) => t('passerA', { espace: profileShortLabel(p, tTypes) }),
      motsEspace: decouperLesMots(t('synonymesEspace')),
    },
  );
  const resultats = chercherDansLaPalette(options, saisie);
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
      if (!bascule.isPending) bascule.mutate(cible.profilId);
    } else {
      router.push(cible.publique ? cheminLocalise(cible.href, locale) : cible.href);
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
    <div className="grid min-w-0 gap-3">
      {/* `pr-8` : la place du bouton de fermeture du `Dialog` (A14). */}
      <div className="pr-8">
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
        />
      </div>
      <p role="status" className="sr-only">
        {t('resultats', { count: resultats.length })}
      </p>
      {/* L'état vide unique du produit (`scripts/check-feedback-states.mjs`), allégé : la palette est
          déjà une surface, ni bordure pointillée ni grand padding. Hors de la listbox, qui n'est pas
          rendue sans option (`aria-controls` et `aria-expanded` du champ le suivent). */}
      {resultats.length === 0 && requete !== '' ? (
        <EmptyState title={t('aucun', { q: requete })} className="rounded-none border-0 bg-transparent px-2 py-6" />
      ) : null}
      {resultats.length > 0 ? (
        <div id={idListe} role="listbox" aria-label={t('titre')} className="-mx-1 max-h-[min(60dvh,28rem)] overflow-y-auto px-1">
          {parGroupe.map(([groupe, liste]) => (
            <div key={groupe} role="group" aria-labelledby={`${idListe}-${groupe}`} className="pb-2">
              <div
                id={`${idListe}-${groupe}`}
                role="presentation"
                className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                {t(`groupes.${TITRES[groupe]}`)}
              </div>
              {liste.map((option) => {
                const index = resultats.indexOf(option);
                const Icone = option.icone;
                const estActive = index === indexActif;
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
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choisir(option);
                    }}
                    onMouseMove={() => setCleActive(option.cle)}
                    // Revue I2 — le surlignage du `Combobox` du dépôt (`ui/combobox.tsx`, `bg-accent` et son
                    // encre appariée) : c'est le SEUL repère de ce qu'Entrée ouvre, et `bg-muted` sur
                    // `--popover` ne faisait que 1,18:1. L'icône et la précision prennent l'encre du fond.
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm',
                      estActive ? 'bg-accent text-accent-foreground' : 'text-foreground',
                    )}
                  >
                    <Icone
                      className={cn('size-4 shrink-0', estActive ? 'text-accent-foreground' : 'text-muted-foreground')}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{option.libelle}</span>
                    {option.precision ? (
                      <span
                        className={cn(
                          'shrink-0 truncate text-xs',
                          estActive ? 'text-accent-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {option.precision}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
