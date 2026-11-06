'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Lock, PanelLeftClose, PanelLeftOpen, Pin, Plus, PlusCircle, Search, ShieldCheck } from 'lucide-react';
import type { User } from '@/types/user';
import { isSuperAdmin } from '@/lib/roles';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProUpgradeCard } from './ProUpgradeCard';
import { CarteDeMiseEnLocation } from './CarteDeMiseEnLocation';
import { useFormatter, useTranslations } from 'next-intl';
import { Logo, SymboleTakussan } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import { useCurrentLocale } from '@/i18n/hooks';
import { cheminLocalise } from '@/i18n/routing';
import { APP_EXACT_ROOTS, resolveActiveHref } from '@/lib/navigation/active-path';
import { HREF_CREDITS } from '@/lib/navigation/acces-app';
import type { NavCounterKey } from '@/lib/navigation/types';
import {
  GROUPES_DIVULGATION,
  avecTitres,
  cheminOuvert,
  type EntreeComposee,
  type GroupeCompose,
} from '@/lib/navigation/composer-menu';
import { DISPOSITIONS } from '@/lib/navigation/dispositions';
import { EPINGLES_MAX } from '@/lib/navigation/preferences';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import { useIconesEffectives } from '@/lib/navigation/use-icones-effectives';
import type { ProfileType } from '@/types/profile';
import { useSoldeCredits } from '@/lib/queries/credits-solde';
import { lignesAujourdhui } from '@/lib/navigation/a-traiter';
import { AujourdhuiDeLaBarre } from './AujourdhuiDeLaBarre';
import { compteAffiche } from './compte-affiche';
import { MenuDuCompte } from './MenuDuCompte';
import { NotificationBell } from './NotificationBell';
import { DemarrerDeLEspace } from './DemarrerDeLEspace';
import { LigneDeStatut } from './LigneDeStatut';
import { RecentsDeLaBarre } from './RecentsDeLaBarre';
import {
  FOCUS_RING,
  FOCUS_RING_RENTRANT,
  ICONE_DE_LIGNE,
  LIBELLE_DE_LIGNE,
  STYLE_COMPTEUR,
  STYLE_EPINGLE,
  STYLE_LIGNE,
  STYLE_LIGNE_ACTIVE,
  STYLE_LIGNE_REPOS,
  STYLE_REPLI,
  STYLE_TITRE,
  TRAIT_D_ICONE,
} from './styles-de-la-barre';
import { usePreferencesDuMenu } from './PreferencesDuMenu';
import { raccourciDeLaPalette, useSurApple } from './useSurApple';
import { useMenuDeLEspace, type EntreeRendue } from './useMenuDeLEspace';
import { COMPTEURS_DE_MODERATION, useCompteursDuMenu } from './useCompteursDuMenu';

export type { NavCounterKey };
// TCK-2481 — la règle de sondage vit désormais dans `useCompteursDuMenu` ; ré-exportée pour les tests
// qui l'importent d'ici.
export { countersToPoll } from './useCompteursDuMenu';

/** TCK-2478 (ADR-0089 §6) — la console de la plateforme, au pied de la barre du persona `plateforme`. */
const HREF_CONSOLE = '/super-admin';

interface AppSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
  /**
   * TCK-267 — pinned at the bottom of the sidebar (above the user footer)
   * for agency admins still on `kind = individual`. Set to `true` once the
   * agency has been promoted to `standard` so the CTA disappears for good.
   */
  agencyIsStandard?: boolean;
  /** `true` when an upgrade request is awaiting super-admin review. */
  hasPendingUpgrade?: boolean;
  /**
   * TCK-2477 (ADR-0089 §2) — le type du profil actif, lu par le layout sur le cookie
   * `active_profile_id`. `null` ou absent : le persona se déduit des rôles.
   */
  typeProfilActif?: ProfileType | null;
  /**
   * TCK-2478 — l'agence du profil actif est suspendue (TCK-600) : ni action principale, ni entrée
   * d'écriture ; la lecture reste.
   */
  agencySuspended?: boolean;
  /**
   * TCK-2483 (ADR-0089, amendement « modules par agence ») — les codes de module que l'agence du
   * profil actif masque, passés par la coque (`modulesMasquesDe`, lu par le layout). Requis : une
   * barre qui l'oublierait rendrait ce que l'agence a retiré.
   */
  readonly modulesMasques: readonly string[];
  /** TCK-2480 — le montage du tiroir (`Sheet`, sous `md`) : jamais réduit aux icônes. */
  tiroir?: boolean;
  /**
   * TCK-2490 (ADR-0090 §2) — ouvre la palette de commandes depuis la ligne « Aller à », qui lui rend
   * le focus à la fermeture. Absent (tests, coque montée ailleurs) : pas de ligne.
   */
  readonly onOuvrirPalette?: (depuis: HTMLElement) => void;
}

/**
 * TCK-2490 (ADR-0090 §1, §7) — un compteur : des chiffres de la couleur primaire (profonde, pour le
 * contraste), pas une pastille pleine. Rail : un point de couleur sur l'icône. Le libellé accessible
 * dit ce qu'il compte (« 3 messages non lus »), dans tous les modes.
 */
function SidebarCounter({ value, label, point }: { value: number; label: string; point: boolean }) {
  return (
    <span
      aria-label={label}
      data-slot="compteur-entree"
      className="ml-auto shrink-0 icones:absolute icones:right-2.5 icones:top-2 icones:ml-0"
    >
      <span className={cn(STYLE_COMPTEUR, 'icones:hidden')}>{compteAffiche(value)}</span>
      {/* Revue adverse (I1) — pas de point dans une liste repliée (`inert`, hauteur nulle) : il n'y
          signalait rien. « Aujourd'hui », visible dans le rail, porte ce qui attend. */}
      {point ? <span aria-hidden data-slot="point-entree" className="hidden size-1.5 rounded-full bg-primary icones:block" /> : null}
    </span>
  );
}

/** TCK-2480 — l'épingle d'une ligne : son état, la limite, le geste. */
interface EpingleDeLigne {
  readonly epinglee: boolean;
  /** Cinq épingles déjà : épingler CETTE ligne est refusé, et le bouton le dit. */
  readonly plein: boolean;
  readonly onBasculer: () => void;
}

interface SidebarItemProps {
  readonly entree: EntreeRendue;
  /** L'`href` à servir : celui de l'entrée, localisé quand elle mène au site public. */
  readonly href: string;
  readonly active: boolean;
  readonly counter?: number;
  /**
   * Revue adverse de TCK-2490 (M3) — ce compte est déjà une ligne d'« Aujourd'hui » : il ne s'affiche pas
   * une seconde fois sur l'entrée. Il reste LU, dans le nom de l'entrée (« Messagerie 47 messages non
   * lus », relevé dans l'arbre d'accessibilité de Chrome avant le changement).
   */
  readonly compteDansAujourdhui?: boolean;
  /** L'entrée est dans une liste repliée (`inert`, hauteur nulle) : son compteur n'y pose pas de point. */
  readonly dansUnRepli?: boolean;
  readonly onNavigate?: () => void;
  /** TCK-642 — une valeur en bout de ligne (le solde de crédits), déjà mise en forme. */
  readonly valeur?: string;
  readonly nomAccessible?: string;
  /** TCK-2480 — absente sans fournisseur, pour une ligne cadenassée, l'action ou le complément « Aussi … ». */
  readonly epingle?: EpingleDeLigne;
  /** TCK-2480 — la barre est réduite MAINTENANT : le libellé passe en infobulle (survol et focus). */
  readonly infobulle?: boolean;
}

/**
 * TCK-2490 — une ligne du menu. Le FOND (repos, survol, actif) est porté par la ligne entière, épingle
 * comprise : l'épingle vit dans la même pilule que son lien, au lieu d'en dépasser. Le lien remplit la
 * ligne ; son anneau de focus est rentrant (les listes se replient en `overflow-hidden`).
 */
function SidebarItem({
  entree,
  href,
  active,
  counter,
  compteDansAujourdhui = false,
  dansUnRepli = false,
  onNavigate,
  valeur,
  nomAccessible,
  epingle,
  infobulle = false,
}: SidebarItemProps) {
  const { labelKey, labelSpace, icon: Icon, emphasized, locked, counterKey } = entree;
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const label = labelSpace === 'nav.admin' ? tAdmin(labelKey) : t(labelKey);
  const libelleCompteur = (cle: NavCounterKey, count: number) =>
    COMPTEURS_DE_MODERATION.has(cle) ? tAdmin('pendingBadge', { count }) : t(`counters.${cle}`, { count });

  if (locked) {
    // Revue de TCK-2480 (M1) — réduite, la ligne cadenassée a la même infobulle qu'une ligne ordinaire
    // (son libellé), plus la raison du cadenas ; le `title` ne reste que barre dépliée (deux bulles
    // superposées sinon). La raison est toujours lue (`sr-only`).
    return (
      <Tooltip disabled={!infobulle}>
        <TooltipTrigger
          render={
            <span
              role="link"
              aria-disabled="true"
              tabIndex={0}
              title={infobulle ? undefined : t('proLocked')}
              className={cn(STYLE_LIGNE, 'cursor-not-allowed text-muted-foreground', FOCUS_RING_RENTRANT)}
            />
          }
        >
          <Icon className={ICONE_DE_LIGNE} strokeWidth={TRAIT_D_ICONE} aria-hidden />
          <span className={LIBELLE_DE_LIGNE}>{label}</span>
          <span className="sr-only">{t('proLocked')}</span>
          <Lock className="ml-auto size-3.5 shrink-0 icones:hidden" aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="right">
          <span className="block font-semibold">{label}</span>
          <span className="block">{t('proLocked')}</span>
        </TooltipContent>
      </Tooltip>
    );
  }
  // TCK-2480 — réduite, le libellé reste lu (`LIBELLE_DE_LIGNE`) et passe en infobulle à l'œil ;
  // l'infobulle n'existe que lorsque la barre est réduite MAINTENANT (`useIconesEffectives`).
  const lien = (
    <Tooltip disabled={!infobulle}>
      <TooltipTrigger
        render={
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            aria-label={nomAccessible}
            className={cn(
              // `relative` : le point du compteur se pose sur l'icône quand la barre est réduite.
              'relative flex-1',
              STYLE_LIGNE,
              FOCUS_RING_RENTRANT,
              active
                ? 'font-medium text-foreground'
                : emphasized
                  ? 'font-medium text-foreground'
                  : 'text-foreground',
            )}
          />
        }
      >
        <Icon className={cn(ICONE_DE_LIGNE, active && 'text-primary')} strokeWidth={TRAIT_D_ICONE} aria-hidden />
        <span className={LIBELLE_DE_LIGNE}>{label}</span>
        {counterKey && counter && counter > 0 ? (
          compteDansAujourdhui ? (
            <span data-slot="compteur-lu" className="sr-only">
              {libelleCompteur(counterKey, counter)}
            </span>
          ) : (
            <SidebarCounter value={counter} label={libelleCompteur(counterKey, counter)} point={!dansUnRepli} />
          )
        ) : null}
        {/* TCK-2491 — la barre du haut et sa pastille sont parties : la valeur se lit ici à toutes les
            largeurs (et dans le menu du compte) ; dans le rail, l'infobulle nomme l'entrée. */}
        {valeur !== undefined ? (
          <span
            data-slot="valeur-entree"
            className="ml-auto shrink-0 text-[12.5px] font-medium tabular-nums text-foreground icones:hidden"
          >
            {valeur}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
  const refusee = epingle !== undefined && epingle.plein && !epingle.epinglee;
  return (
    <div
      data-ligne=""
      className={cn(
        'group/ligne flex items-center rounded-lg transition-colors motion-reduce:transition-none',
        active ? 'bg-foreground/8' : 'hover:bg-foreground/5',
      )}
    >
      {lien}
      {/* TCK-2480 — l'épingle est une SŒUR du lien (un bouton dans un lien n'est pas valide) : bouton à
          bascule, nom constant, état dans `aria-pressed`. Refusée (A7, cinq épingles), elle reste
          atteignable et dit pourquoi (`aria-disabled` + `title`), au lieu de disparaître. */}
      {epingle ? (
        <button
          type="button"
          // Revue (I2) — retrouvé par `basculerLEpingle` à la nouvelle place de la ligne.
          data-epingle={entree.id}
          aria-pressed={epingle.epinglee}
          aria-disabled={refusee || undefined}
          aria-label={t('epingle.epingler', { libelle: label })}
          title={refusee ? t('epingle.plein') : undefined}
          onClick={refusee ? undefined : epingle.onBasculer}
          className={cn(STYLE_EPINGLE, FOCUS_RING)}
        >
          <Pin className={cn('size-3.5', epingle.epinglee && 'fill-current')} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Un compte qu'un groupe replié cache, et qu'« Aujourd'hui » ne porte pas. */
interface CompteCache {
  readonly nombre: number;
  readonly libelle: string;
}

interface GroupeDuMenuProps {
  readonly groupe: GroupeCompose & { readonly entrees: readonly EntreeRendue[] };
  /** TCK-377 — les titres de SECTION paraissent (`avecTitres`). */
  readonly titres: boolean;
  readonly premier: boolean;
  readonly idBase: string;
  readonly activeHref: string | null;
  /** `replie` : la liste qui la porte est repliée (`inert`, hauteur nulle). */
  readonly rendreEntree: (entree: EntreeRendue, replie: boolean) => ReactNode;
  /**
   * TCK-2480 — replier ou ouvrir le groupe, ENREGISTRÉ sur le compte (A8). Absent (aucun
   * fournisseur) : seuls les groupes repliés par défaut se basculent, pour ce montage seulement.
   */
  readonly onBasculer?: (groupe: string, replie: boolean, replieParDefaut: boolean) => void;
  /** TCK-2480 — la barre est réduite MAINTENANT : le titre du bouton de bascule passe en infobulle. */
  readonly infobulle: boolean;
  /**
   * Suite de la revue adverse (b) — les comptes non nuls du groupe ABSENTS d'« Aujourd'hui », avec leur
   * libellé (« 2 demandes de visite en attente »). Un groupe replié les signale sur son titre.
   */
  readonly comptesCaches?: readonly CompteCache[];
}

/** Les groupes dont le titre paraît toujours : les divulgations, et « Épinglés » (on voit où va l'entrée, A6). */
const TOUJOURS_TITRES: ReadonlySet<string> = new Set([...GROUPES_DIVULGATION, 'epingles']);

/**
 * TCK-2478 — un groupe de la disposition ; TCK-2480 — repliable d'un clic sur son titre, et le repli
 * s'enregistre (A8).
 *
 * - « Plus » et « Aussi … » sont des DIVULGATIONS (`GROUPES_DIVULGATION`) : leur titre paraît toujours,
 *   titres de section ou non (décision de la session du 2026-11-05 : le prestataire garde son « Plus »
 *   sans qu'aucun titre de section paraisse — AC5 de TCK-2478). « Épinglés » aussi (A6).
 * - Un groupe replié (par sa disposition ou par l'utilisateur) est titré.
 * - Un groupe déplié ne montre son titre que si `titres` (TCK-377).
 * - Avec le fournisseur, tout titre qui paraît est le bouton de bascule, et le repli vient du compte
 *   (`groupe.replie`, composé par `composerMenu`). Sans lui, seuls les groupes repliés par défaut se
 *   basculent, dans un état local (TCK-2478).
 *
 * AC4 de TCK-2478 — l'entrée active n'est jamais cachée : un groupe qui la contient s'ouvre à l'arrivée
 * sur elle, au montage comme à la navigation (la barre survit aux navigations du layout), SANS rien
 * écrire (A8). Le refermer alors ne fait que le refermer : il est déjà replié pour le compte.
 * L'ajustement se fait pendant le rendu, sur le patron « état dérivé d'une prop », sans effet.
 *
 * TCK-2480 (A11) — barre réduite : un titre devient un séparateur (il reste lu) ; un groupe repliable
 * garde son chevron, qui reste le bouton.
 *
 * TCK-2490 (ADR-0090 §1) — titre en casse de phrase, chevron au survol (toujours visible replié, et au
 * doigt) ; le repli est ANIMÉ (`grid-template-rows`, 300 ms) : la liste repliée reste dans le DOM,
 * `inert` (ni focus ni clic) et `aria-hidden` (ni lue ni trouvée), sa hauteur ramenée à zéro.
 */
function GroupeDuMenu({
  groupe,
  titres,
  premier,
  idBase,
  activeHref,
  rendreEntree,
  onBasculer,
  infobulle,
  comptesCaches = [],
}: GroupeDuMenuProps) {
  const t = useTranslations('nav.sidebar');
  const contientLActif = activeHref !== null && groupe.entrees.some((e) => e.href === activeHref);
  const replieParDefaut = groupe.replieParDefaut ?? groupe.replie;
  const [replieLocal, setReplieLocal] = useState(groupe.replie);
  const replie = onBasculer ? groupe.replie : replieLocal;
  const [ouvertParLActif, setOuvertParLActif] = useState(contientLActif);
  const [actifVu, setActifVu] = useState(contientLActif);
  if (contientLActif !== actifVu) {
    setActifVu(contientLActif);
    // Comme TCK-2478 : on ouvre à l'arrivée, on ne referme pas au départ.
    if (contientLActif) setOuvertParLActif(true);
  }
  const ouvert = !replie || ouvertParLActif;

  const avecTitre =
    groupe.titre !== null && (titres || replie || replieParDefaut || TOUJOURS_TITRES.has(groupe.id));
  const bascule = avecTitre && (onBasculer !== undefined || replieParDefaut);
  const ferme = bascule && !ouvert;
  const libelle = groupe.titre !== null ? t(`groupes.${groupe.titre}`, groupe.titreValeurs) : null;
  const idTitre = `${idBase}-${groupe.id}-titre`;
  const idListe = `${idBase}-${groupe.id}-liste`;
  // Suite de la revue adverse (b) — la liste repliée n'a ni hauteur ni point (`inert`) : un compte
  // qu'« Aujourd'hui » ne porte pas y devenait invisible. Le titre le signale tant que le groupe est
  // replié : réduite, sur le chevron (seule icône du groupe), du même point que les lignes d'« Aujourd'hui »,
  // le nombre en infobulle ; dépliée, en chiffres de compteur au même bord droit que les autres (le
  // dernier enfant d'un bouton au même `px-2.5` que les lignes). Dans les deux cas le nom du bouton le dit.
  // Déplié, le titre se tait : le compte est sur l'entrée.
  const signal = ferme && comptesCaches.length > 0;
  const libellesCaches = comptesCaches.map((c) => c.libelle).join(', ');

  const basculer = () => {
    setOuvertParLActif(false);
    // Ouvert par la page active seulement : le refermer ne change rien au compte.
    if (replie && ouvert) return;
    if (onBasculer) onBasculer(groupe.id, ouvert, replieParDefaut);
    else setReplieLocal(ouvert);
  };

  return (
    // Un groupe titré se lit comme un GROUPE : le lecteur d'écran annonce son nom en y entrant
    // (« Activité, groupe »), comme l'œil lit l'en-tête.
    <div
      role={avecTitre ? 'group' : undefined}
      aria-labelledby={avecTitre ? idTitre : undefined}
      data-groupe={groupe.id}
      // TCK-2490 (ADR-0090 §7) — dans le rail, un filet sépare les groupes (maquette « Atelier ») : les
      // titres y sont lus, pas montrés ; la bascule d'un groupe replié reste son chevron, nommé en infobulle.
      className={cn(!premier && 'mt-5 icones:mt-2 icones:border-t icones:border-border/60 icones:pt-2')}
    >
      {bascule ? (
        <Tooltip disabled={!infobulle}>
          <TooltipTrigger
            render={
              <button
                type="button"
                id={idTitre}
                aria-expanded={ouvert}
                aria-controls={idListe}
                onClick={basculer}
                className={cn(
                  'group/titre relative mb-0.5 flex h-7 w-full items-center gap-1 rounded-md px-2.5 text-left transition-colors hover:text-foreground max-md:h-9 icones:justify-center icones:px-0',
                  STYLE_TITRE,
                  FOCUS_RING,
                )}
              />
            }
          >
            <span className={LIBELLE_DE_LIGNE}>{libelle}</span>
            <ChevronDown
              aria-hidden
              className={cn(
                'size-3.5 shrink-0 transition-[opacity,transform] duration-200 motion-reduce:transition-none',
                ouvert
                  ? 'opacity-0 group-hover/titre:opacity-100 group-focus-visible/titre:opacity-100 tactile:opacity-100 icones:opacity-100'
                  : '-rotate-90 opacity-100',
              )}
            />
            {signal ? (
              <>
                <span
                  aria-hidden
                  data-slot="point-groupe"
                  className="absolute right-3 top-1 hidden size-1.5 rounded-full bg-primary icones:block"
                />
                <span className="sr-only">{libellesCaches}</span>
                <span aria-hidden data-slot="compte-groupe" className={cn(STYLE_COMPTEUR, 'icones:hidden')}>
                  {compteAffiche(comptesCaches.reduce((somme, c) => somme + c.nombre, 0))}
                </span>
              </>
            ) : null}
          </TooltipTrigger>
          <TooltipContent side="right">
            {signal ? t('aujourdhui.infobulle', { libelle: libelle ?? '', nombre: libellesCaches }) : libelle}
          </TooltipContent>
        </Tooltip>
      ) : avecTitre ? (
        <p id={idTitre} className={cn('mb-0.5 flex h-7 items-center px-2.5 icones:sr-only', STYLE_TITRE)}>
          {libelle}
        </p>
      ) : null}
      {bascule ? (
        <div
          id={idListe}
          data-replie={ferme ? '' : undefined}
          inert={ferme}
          aria-hidden={ferme || undefined}
          className={cn(STYLE_REPLI, ferme ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')}
        >
          <div className="min-h-0 space-y-px overflow-hidden">{groupe.entrees.map((e) => rendreEntree(e, ferme))}</div>
        </div>
      ) : (
        <div id={idListe} className="space-y-px">
          {groupe.entrees.map((e) => rendreEntree(e, false))}
        </div>
      )}
    </div>
  );
}

interface BasculeDesIconesProps {
  readonly mode: ModeIcones;
  readonly infobulle: boolean;
  readonly onBasculer: () => void;
}

/**
 * TCK-2480 (A10) — le bouton qui choisit le mode explicite OPPOSÉ à l'état effectif. Son nom suit
 * l'état : en `auto`, les deux libellés sont rendus et le CSS en montre un (le serveur ne sait pas
 * lequel) ; en mode explicite, un seul.
 *
 * TCK-2490 (ADR-0090 §2) — monté dans l'en-tête de la colonne, en bouton d'icône (« Replier la
 * barre »), son nom toujours lu et en infobulle.
 */
function BasculeDesIcones({ mode, infobulle, onBasculer }: BasculeDesIconesProps) {
  const t = useTranslations('nav.sidebar.icones');
  const auto = mode === 'auto';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-slot="bascule-icones"
            onClick={onBasculer}
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground',
              FOCUS_RING,
            )}
          />
        }
      >
        {mode !== 'icones' ? (
          <PanelLeftClose className={cn(ICONE_DE_LIGNE, auto && 'icones:hidden')} strokeWidth={TRAIT_D_ICONE} aria-hidden />
        ) : null}
        {mode !== 'complet' ? (
          <PanelLeftOpen
            className={cn(ICONE_DE_LIGNE, auto && 'hidden icones:block')}
            strokeWidth={TRAIT_D_ICONE}
            aria-hidden
          />
        ) : null}
        {mode !== 'icones' ? <span className={cn('sr-only', auto && 'icones:hidden')}>{t('reduire')}</span> : null}
        {mode !== 'complet' ? <span className={auto ? 'hidden icones:inline icones:sr-only' : 'sr-only'}>{t('deplier')}</span> : null}
      </TooltipTrigger>
      <TooltipContent side={infobulle ? 'right' : 'bottom'}>{infobulle ? t('deplier') : t('reduire')}</TooltipContent>
    </Tooltip>
  );
}

interface LigneAllerAProps {
  readonly onOuvrir: (depuis: HTMLElement) => void;
  readonly infobulle: boolean;
}

/**
 * TCK-2490 (ADR-0090 §2) — « Aller à » : une ligne du menu qui ouvre la palette de commandes (TCK-2482),
 * la fonction du bouton de l'ancienne barre du haut. Son nom accessible commence par le texte visible
 * (WCAG 2.5.3), elle annonce son raccourci (`aria-keyshortcuts`) et le montre en touches discrètes —
 * pas au doigt, qui n'a pas de clavier.
 */
function LigneAllerA({ onOuvrir, infobulle }: LigneAllerAProps) {
  const t = useTranslations('nav.palette');
  const surApple = useSurApple();
  const touches = (surApple ? t('raccourciMac') : t('raccourciAutre')).split(' ');
  return (
    <Tooltip disabled={!infobulle}>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-slot="aller-a"
            onClick={(event) => onOuvrir(event.currentTarget)}
            aria-label={t('titre')}
            aria-keyshortcuts={raccourciDeLaPalette(surApple)}
            className={cn('w-full transition-colors', STYLE_LIGNE, STYLE_LIGNE_REPOS, FOCUS_RING_RENTRANT)}
          />
        }
      >
        <Search className={ICONE_DE_LIGNE} strokeWidth={TRAIT_D_ICONE} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left icones:sr-only">{t('ouvrir')}</span>
        <span aria-hidden className="ml-auto flex shrink-0 gap-0.5 max-md:hidden tactile:hidden icones:hidden">
          {touches.map((touche) => (
            <kbd
              key={touche}
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] px-1 font-sans text-[11px] font-medium leading-none text-muted-foreground ring-1 ring-inset ring-border"
            >
              {touche}
            </kbd>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{t('ouvrir')}</TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({
  user,
  className,
  onNavigate,
  agencyIsStandard,
  hasPendingUpgrade,
  typeProfilActif,
  agencySuspended = false,
  modulesMasques,
  tiroir = false,
  onOuvrirPalette,
}: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const locale = useCurrentLocale();
  const idBase = useId();
  // TCK-2481 — la composition du menu et ses compteurs, partagées avec la barre d'onglets mobile
  // (`BarreDOnglets`) : une seule composition, une seule règle de sondage (ADR-0089 §4-5).
  const { persona, ctx: ctxMenu, menu, groupes, entrees } = useMenuDeLEspace({
    user,
    agencyIsStandard,
    typeProfilActif,
    agencySuspended,
    modulesMasques,
  });
  // TCK-2480 — les préférences du compte : le RENDU (mode icônes, épingles, replis, « Démarrer ») ;
  // la composition les a déjà lues (`useMenuDeLEspace`), dans le même contexte.
  const prefs = usePreferencesDuMenu();
  // TCK-2480 (A10, A11) — le mode de l'appareil : `data-menu` sur la barre, la largeur en CSS
  // (variante `icones:`). Les variantes compactes ne sont RENDUES que si la barre peut se réduire.
  const modeIcones: ModeIcones = tiroir ? 'complet' : prefs.modeIcones;
  const reductible = modeIcones !== 'complet';
  const infobulle = useIconesEffectives(modeIcones);
  const lien = (e: EntreeComposee) => (e.publique ? cheminLocalise(e.href, locale) : e.href);
  const libelleDEntree = (e: EntreeComposee) => (e.labelSpace === 'nav.admin' ? tAdmin(e.labelKey) : t(e.labelKey));

  const counters = useCompteursDuMenu(entrees, { agencyIsStandard });
  // TCK-2490 (ADR-0090 §3) — « Aujourd'hui » : les entrées RENDUES (donc sondées, `countersToPoll`),
  // dans l'ordre du persona (`lignesAujourdhui`, TCK-2489). Aucun compteur de plus que le menu.
  const aujourdhui = lignesAujourdhui(entrees, counters, menu.priorites);
  // Revue adverse (M3) — chaque compte ne paraît qu'une fois : celui d'une ligne d'« Aujourd'hui » quitte
  // son entrée (il y reste lu). Les compteurs absents d'« Aujourd'hui » restent sur leur entrée.
  const comptesDAujourdhui = new Set(aujourdhui.map((ligne) => ligne.cle));
  // TCK-642 — le solde de l'espace, lu par la PRÉSENCE de l'entrée « Crédits » (même principe que
  // les compteurs) ; `null` tant qu'il n'est pas connu, et alors l'entrée reste nue.
  const solde = useSoldeCredits({
    enabled: entrees.some((e) => e.href === HREF_CREDITS && !e.locked),
  });

  // TCK-2478 — l'action principale concourt avec les entrées : sur sa page (`/app/properties/new`),
  // c'est elle qui est courante, et « Biens », son parent d'URL, ne s'allume pas.
  const activeHref = resolveActiveHref(
    pathname,
    [...entrees.map((e) => e.href), ...(menu.action && !menu.action.publique ? [menu.action.href] : [])],
    APP_EXACT_ROOTS,
  );
  const titres = avecTitres(groupes);

  // L'action principale : sa clé vient de la disposition (`nav.sidebar.actions.*`) quand elle en
  // porte une (« Payer mon loyer »), sinon c'est le libellé de sa destination.
  const action = menu.action;
  const libelleAction = action
    ? DISPOSITIONS[menu.persona].libelleAction
      ? t(`actions.${action.labelKey}`)
      : libelleDEntree(action)
    : null;
  // TCK-2490 — dans la pastille ronde de l'action, le « + » nu : un cercle dans un cercle ne se lit pas.
  const IconeAction = action?.icon === PlusCircle ? Plus : action?.icon;
  // Revue de TCK-2478 (M1) — l'action n'est la page courante que si AUCUNE entrée rendue ne porte son
  // `href` : le locataire sur `/app/payments` allumait « Payer mon loyer » ET « Paiements ». L'entrée
  // du menu l'emporte, l'action ne s'allume que sur une page qu'elle seule mène (`/app/properties/new`).
  const actionCourante =
    action !== null && action.href === activeHref && !entrees.some((e) => e.href === action.href);

  const showProUpgradeCard =
    user.roles.includes('agency_admin') &&
    typeof user.agency_id === 'number' &&
    agencyIsStandard === false;

  // Revue de TCK-2480 (I2) — épingler déplace la ligne d'un groupe à l'autre : le bouton qui avait le
  // focus est démonté, et le focus tombait sur `<body>` (WCAG 2.4.3). Le geste est appliqué par
  // `flushSync`, puis le focus passe aussitôt à l'épingle de la MÊME destination à sa nouvelle place —
  // dans le même événement, avant la peinture : ni effet, ni état « focus à rendre » qui pourrait
  // rester en plan. La recherche part de CETTE barre (`barre`) : la barre fixe et le tiroir, deux
  // montages, ne se volent pas le focus.
  const barre = useRef<HTMLElement>(null);
  const basculerLEpingle = (id: EntreeComposee['id']) => {
    flushSync(() => prefs.basculerEpingle(persona, id, menu.epingles));
    barre.current?.querySelector<HTMLButtonElement>(`button[data-epingle="${id}"]`)?.focus();
  };
  // Même famille (décision de la session) — la croix de « Démarrer » démonte le bloc qui avait le
  // focus : il passe au premier élément focalisable du menu qui le SUIT (le premier groupe hors
  // « Épinglés », qui le précède), cherché dans CETTE barre, sans effet. Pas de `flushSync` ici,
  // contrairement à l'épingle : la cible existe avant comme après le geste (masquer « Démarrer » ne
  // remonte aucun groupe — mesuré par ablation). Un groupe replié garde son titre-bouton AVANT sa
  // liste repliée (`inert`) : le premier focalisable trouvé est donc toujours visible.
  const masquerDemarrer = () => {
    barre.current
      ?.querySelector<HTMLElement>('[data-slot="menu"] [data-groupe]:not([data-groupe="epingles"]) :is(a[href], button, [tabindex="0"])')
      ?.focus();
    prefs.masquerDemarrer(persona);
  };

  const rendreEntree = (entree: EntreeRendue, replie = false) => (
    <SidebarItem
      key={entree.href}
      entree={entree}
      href={lien(entree)}
      active={entree.href === activeHref}
      counter={entree.counterKey ? counters[entree.counterKey] : undefined}
      compteDansAujourdhui={entree.counterKey !== undefined && comptesDAujourdhui.has(entree.counterKey)}
      dansUnRepli={replie}
      onNavigate={onNavigate}
      {...(entree.href === HREF_CREDITS && solde !== null
        ? { valeur: format.number(solde), nomAccessible: tNav('creditsBalance', { count: solde }) }
        : {})}
      infobulle={infobulle}
      epingle={
        // TCK-2480 (A7) — ni l'action, ni la carte, ni « Aussi … » (`epinglable` absent), ni une ligne
        // cadenassée. Le geste repart des épingles RENDUES (`menu.epingles`).
        prefs.actif && entree.epinglable && !entree.locked
          ? {
              epinglee: entree.epinglee === true,
              plein: menu.epingles.length >= EPINGLES_MAX,
              onBasculer: () => basculerLEpingle(entree.id),
            }
          : undefined
      }
    />
  );
  // TCK-2480 (A8) — avec le fournisseur, tout groupe titré se replie, et l'écart s'enregistre.
  const basculerGroupe = prefs.actif
    ? (id: string, replie: boolean, parDefaut: boolean) => prefs.basculerRepli(persona, id, replie, parDefaut)
    : undefined;
  const [epingles, autresComposes] = groupes[0]?.id === 'epingles' ? [groupes[0], groupes.slice(1)] : [null, groupes];
  // Revue adverse de TCK-2490 (3) — quand le menu s'ouvre sur le tableau de bord (la disposition de l'admin
  // d'agence, ADR-0090 §4), le porteur le veut EN TÊTE : il quitte le groupe de tête et se pose juste après
  // l'action et « Aller à », AVANT « Aujourd'hui » et « Démarrer ». La composition ne change pas (c'est
  // une donnée de `dispositions.ts`) : seul le rendu le hisse. Épinglé, il est dans « Épinglés » et
  // n'ouvre plus le groupe de tête : rien n'est hissé.
  const tete = autresComposes[0];
  const tableauEnTete = tete?.id === 'tete' && tete.entrees[0]?.id === 'tableau-de-bord' ? tete.entrees[0] : null;
  const autres = tableauEnTete
    ? [{ ...tete!, entrees: tete!.entrees.slice(1) }, ...autresComposes.slice(1)].filter((g) => g.entrees.length > 0)
    : autresComposes;
  // Suite de la revue adverse (b) — les comptes d'un groupe qu'« Aujourd'hui » ne porte pas, libellés.
  const comptesCachesDu = (groupe: (typeof groupes)[number]) =>
    groupe.entrees.flatMap((e) => {
      const n = e.counterKey && !e.locked ? counters[e.counterKey] : undefined;
      if (!e.counterKey || !n || n <= 0 || comptesDAujourdhui.has(e.counterKey)) return [];
      return [
        {
          nombre: n,
          libelle: COMPTEURS_DE_MODERATION.has(e.counterKey)
            ? tAdmin('pendingBadge', { count: n })
            : t(`counters.${e.counterKey}`, { count: n }),
        },
      ];
    });
  const rendreGroupe = (groupe: (typeof groupes)[number], premier: boolean) => (
    <GroupeDuMenu
      key={groupe.id}
      groupe={groupe}
      titres={titres}
      premier={premier}
      idBase={idBase}
      activeHref={activeHref}
      rendreEntree={rendreEntree}
      onBasculer={basculerGroupe}
      infobulle={infobulle}
      comptesCaches={comptesCachesDu(groupe)}
    />
  );

  return (
    <aside
      ref={barre}
      data-menu={modeIcones}
      className={cn(
        // TCK-2490 (ADR-0090 §1) — la colonne « Atelier » : le lin un cran sous la page (`--muted` à
        // 45 % sur le fond de la coque), un filet à droite ; 272 px, rail de 60 px (§7).
        'flex h-full flex-col border-r border-border/70 bg-muted/45 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
        tiroir ? 'w-full border-r-0' : 'w-[272px] icones:w-[60px]',
        className,
      )}
    >
      {/* TCK-2490 (ADR-0090 §2) — l'en-tête de 56 px : la marque à gauche (vers `/`), puis (TCK-2491) la
          cloche et le bouton « Replier » à droite ; rail : le symbole, la cloche et le bouton, l'un sous
          l'autre.
          Le tiroir n'a pas de cloche : l'en-tête mobile, qu'il recouvre, porte la sienne. */}
      <div className="flex h-14 shrink-0 items-center gap-2 px-3 icones:h-auto icones:flex-col icones:gap-1 icones:px-0 icones:py-3">
        {/* Revue adverse (M4) — dans le rail aussi : de 768 à 1023 px c'est le mode par défaut, et sans
            elle la coque n'avait plus de lien vers l'accueil. Le symbole seul ; le nom reste lu. */}
        <Link
          href="/"
          onClick={onNavigate}
          data-slot="marque"
          className={cn('inline-flex shrink-0 rounded-md px-1.5 py-1 icones:px-1', FOCUS_RING)}
        >
          <span data-slot="marque-complete" className="inline-flex icones:hidden">
            <Logo nom={tCommon('appName')} />
          </span>
          <span data-slot="marque-symbole" className="hidden icones:inline-flex">
            <SymboleTakussan className="block h-[18px] w-[26px]" />
            <span className="sr-only">{tCommon('appName')}</span>
          </span>
        </Link>
        {/* TCK-2480 (A10) — la bascule de l'appareil : jamais dans le tiroir, jamais sans fournisseur. */}
        {tiroir ? null : (
          <div className="ml-auto flex items-center gap-0.5 icones:ml-0 icones:flex-col icones:gap-1">
            <NotificationBell align="start" />
            {prefs.actif ? (
              <BasculeDesIcones
                mode={modeIcones}
                infobulle={infobulle}
                onBasculer={() => prefs.choisirModeIcones(infobulle ? 'complet' : 'icones')}
              />
            ) : null}
          </div>
        )}
      </div>
      {/* TCK-2478 — l'action principale du persona, puis (TCK-2490) « Aller à ». L'action est la
          seule surface de couleur primaire du menu (sa pastille) ; absente (jamais désactivée) quand
          le profil ne peut pas l'accomplir — dont l'espace suspendu (TCK-600). Elles ne défilent
          pas : on les atteint toujours.
          Suite de la revue adverse (a) — UN repère de navigation pour la colonne : l'action, « Aller à »,
          le tableau de bord hissé, « Aujourd'hui », le menu et « Récents ». Le tableau de bord hissé hors
          du `<nav>` échappait à qui saute au menu par les repères. La marque, la cloche et le compte, qui
          ne mènent pas dans l'espace, restent hors du repère. */}
      <nav aria-label={t('navLabel')} className="flex min-h-0 flex-1 flex-col">
        {(action && IconeAction) || onOuvrirPalette || tableauEnTete ? (
          <div className="shrink-0 space-y-px px-2 pb-2">
            {action && IconeAction ? (
              <Tooltip disabled={!infobulle}>
                <TooltipTrigger
                  render={
                    <Link
                      href={lien(action)}
                      onClick={onNavigate}
                      data-slot="action-principale"
                      aria-current={actionCourante ? 'page' : undefined}
                      className={cn(
                        // TCK-2478 — mesuré au navigateur : « Proposer un bien à mon agence » était tronqué.
                        // L'action dit ce qu'elle fait en entier : elle passe à la ligne, jamais d'ellipse.
                        STYLE_LIGNE,
                        'h-auto min-h-9 py-1.5 transition-colors max-md:h-auto max-md:min-h-10',
                        actionCourante ? STYLE_LIGNE_ACTIVE : 'hover:bg-foreground/5',
                        FOCUS_RING_RENTRANT,
                      )}
                    />
                  }
                >
                  <span className="-mx-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <IconeAction className="size-3.5" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="min-w-0 text-left font-medium leading-snug text-pretty text-foreground icones:sr-only">
                    {libelleAction}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">{libelleAction}</TooltipContent>
              </Tooltip>
            ) : null}
            {onOuvrirPalette ? <LigneAllerA onOuvrir={onOuvrirPalette} infobulle={infobulle} /> : null}
            {tableauEnTete ? rendreEntree(tableauEnTete) : null}
          </div>
        ) : null}
        {/* TCK-843 — `relative` : bloc conteneur des `sr-only` (absolus) de la liste. Sans lui,
            c'était la fenêtre ; aucun `overflow` ne les coupait, et posés en bas de la liste ils
            allongeaient le document — la coque entière de `/app` défilait. TCK-2490 — c'est la zone qui
            défile (« Aujourd'hui », le menu, « Récents ») ; barre de défilement fine. */}
        <div
          data-slot="defilement"
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1 [scrollbar-width:thin]"
        >
          {/* TCK-2490 (ADR-0090 §3) — ce qui attend une réponse, HORS du menu (`data-slot="menu"`) : le
              menu ne bouge jamais selon un compteur. Rien n'est rendu quand rien n'attend. */}
          <AujourdhuiDeLaBarre lignes={aujourdhui} entrees={entrees} onNavigate={onNavigate} infobulle={infobulle} />
          <div data-slot="menu" className="relative">
            {/* TCK-2480 (A6) — « Épinglés » d'abord, avant « Démarrer », qui est transitoire. */}
            {epingles ? rendreGroupe(epingles, true) : null}
            {/* TCK-2479 — « Démarrer » : un espace neuf sait par où commencer. Dans le menu, il défile
                avec le menu ; il n'en réordonne aucune entrée. `menu.demarrer` est `null` pour un persona
                sans mise en service, dans un espace suspendu, et (TCK-2480, A9) masqué par l'utilisateur
                pour ce persona : ni groupe, ni lecture. */}
            {menu.demarrer ? (
              <DemarrerDeLEspace
                mode={menu.demarrer}
                ouverte={(href) => cheminOuvert(ctxMenu, href)}
                onNavigate={onNavigate}
                onMasquer={prefs.actif ? masquerDemarrer : undefined}
                // TCK-2480 — réduite, « Démarrer » (des étapes à lire) se cache : il revient barre dépliée.
                className={cn(epingles && 'mt-5', 'icones:hidden')}
              />
            ) : null}
            {/* `premier` : sans « Épinglés », le premier groupe ouvre le menu (la marge basse de
                « Démarrer », qui peut ne rien rendre, ne se double pas d'une marge haute). */}
            {autres.map((groupe, index) => rendreGroupe(groupe, index === 0 && epingles === null))}
          </div>
          {/* TCK-2490 (ADR-0090 §5) — les pages récentes de l'appareil, quatre au plus, sans icône. */}
          <RecentsDeLaBarre
            compte={user.id}
            groupes={groupes}
            pathname={pathname}
            libelle={libelleDEntree}
            lien={lien}
            onNavigate={onNavigate}
          />
        </div>
      </nav>
      <div className="shrink-0 space-y-px border-t border-border/70 p-2">
        {/* TCK-2490 (ADR-0090 §6) — les cartes deviennent des lignes de statut, au-dessus du compte.
            Rail : la ligne de mise en location garde son icône ; « Passer en agence » se cache. */}
        {menu.carte ? (
          <CarteDeMiseEnLocation href={lien(menu.carte)} onNavigate={onNavigate} infobulle={infobulle} />
        ) : null}
        {showProUpgradeCard ? (
          <div className={reductible ? 'icones:hidden' : undefined}>
            <ProUpgradeCard pending={Boolean(hasPendingUpgrade)} onNavigate={onNavigate} />
          </div>
        ) : null}
        {/* Revue de TCK-2478 — la console suit le RÔLE, pas le persona : un super-admin dont le profil
            actif est d'agence (persona `admin-agence`) la perdait. La console garde sa propre porte. */}
        {isSuperAdmin(user.roles) ? (
          <LigneDeStatut
            href={HREF_CONSOLE}
            slot="console"
            icone={ShieldCheck}
            tonIcone="text-muted-foreground"
            titre={t('console')}
            texte={t('statut.console')}
            infobulle={infobulle}
            onNavigate={onNavigate}
          />
        ) : null}
        {/* TCK-2491 (ADR-0090 §2) — le compte et SON menu : espace, crédits, profil, préférences,
            administration, langue, déconnexion — ce que portait la barre du haut. */}
        <MenuDuCompte user={user} libelleRole={t(`personas.${persona}`)} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
