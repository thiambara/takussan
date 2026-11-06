'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Home, Lock, PanelLeftClose, PanelLeftOpen, Pin, ShieldCheck, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { isAgent, isAdmin, isSuperAdmin } from '@/lib/roles';
import { useMyCapabilities } from '@/hooks/useCan';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import { useAuth } from '@/context/AuthContext';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import { COMPTE_DES_AVIS_EN_ATTENTE } from '@/components/admin/statut-de-la-file';
import {
  AGENCY_QUEUE_REFETCH_INTERVAL_MS,
  AGENCY_QUEUE_STALE_TIME_MS,
  propertyModerationCountQueryOptions,
} from '@/lib/queries/agency-queues';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProUpgradeCard } from './ProUpgradeCard';
import { CarteDeMiseEnLocation } from './CarteDeMiseEnLocation';
import { EnTeteDEspace } from './EnTeteDEspace';
import { useFormatter, useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import { initialesDe, libelleDe } from '@/lib/identite';
import { useCurrentLocale } from '@/i18n/hooks';
import { cheminLocalise } from '@/i18n/routing';
import { APP_EXACT_ROOTS, resolveActiveHref } from '@/lib/navigation/active-path';
import { HREF_CREDITS } from '@/lib/navigation/acces-app';
import type { NavCounterKey } from '@/lib/navigation/types';
import {
  GROUPES_DIVULGATION,
  avecTitres,
  cheminOuvert,
  composerMenu,
  type EntreeComposee,
  type GroupeCompose,
} from '@/lib/navigation/composer-menu';
import { DISPOSITIONS } from '@/lib/navigation/dispositions';
import { personaDeLaCoque } from '@/lib/navigation/personas';
import { EPINGLES_MAX, prefsDe } from '@/lib/navigation/preferences';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import { useIconesEffectives } from '@/lib/navigation/use-icones-effectives';
import type { ProfileType } from '@/types/profile';
import { useSoldeCredits } from '@/lib/queries/credits-solde';
import { useUnreadCount } from '@/components/chat-widget/useUnreadCount';
import { usePendingVisitsCount } from '@/lib/queries/visits';
import { useUnhandledLeadsCount } from '@/lib/queries/contact-leads';
import { pastillesATraiter } from '@/lib/navigation/a-traiter';
import { BandeATraiter } from './BandeATraiter';
import { DemarrerDeLEspace } from './DemarrerDeLEspace';
import { FOCUS_RING, LIBELLE_DE_LIGNE, STYLE_EPINGLE, STYLE_TITRE } from './styles-de-la-barre';
import { usePreferencesDuMenu } from './PreferencesDuMenu';

export type { NavCounterKey };

/** Compteurs dont le libellé accessible vit sous `nav.admin` (`pendingBadge`), pas `nav.sidebar`. */
const COMPTEURS_DE_MODERATION: ReadonlySet<NavCounterKey> = new Set([
  'reviewModeration',
  'propertyModeration',
]);

/** TCK-2478 (ADR-0089 §6) — la console de la plateforme, au pied de la barre du persona `plateforme`. */
const HREF_CONSOLE = '/super-admin';

/**
 * Une entrée rendue : celle du menu composé, plus le cadenas de l'agence `individual`.
 *
 * Une entrée porte une CLÉ de libellé, pas un libellé. `composerMenu` (`@/lib/navigation/composer-menu`)
 * est une fonction pure appelée hors composant : `useTranslations` n'y est pas appelable, et l'y
 * rendre appelable voudrait dire la transformer en hook — donc la rendre intestable. Le patron
 * retenu est celui que TCK-286 applique partout où le texte naît loin de l'écran : **la donnée
 * transporte la clé, le rendu la résout**.
 */
type EntreeRendue = EntreeComposee & { readonly locked?: boolean };

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
  /** TCK-2480 — le montage du tiroir (`Sheet`, sous `md`) : jamais réduit aux icônes. */
  tiroir?: boolean;
}

function SidebarCounter({ value, label }: { value: number; label: string }) {
  return (
    <span
      aria-label={label}
      className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground icones:absolute icones:right-0.5 icones:top-0.5 icones:ml-0 icones:min-w-4 icones:px-1 icones:text-[10px]"
    >
      {value > 99 ? '99+' : value}
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
  readonly onNavigate?: () => void;
  /** TCK-642 — une valeur en bout de ligne (le solde de crédits), déjà mise en forme. */
  readonly valeur?: string;
  readonly nomAccessible?: string;
  /** TCK-2480 — absente sans fournisseur, pour une ligne cadenassée, l'action ou le complément « Aussi … ». */
  readonly epingle?: EpingleDeLigne;
  /** TCK-2480 — la barre est réduite MAINTENANT : le libellé passe en infobulle (survol et focus). */
  readonly infobulle?: boolean;
}

function SidebarItem({
  entree,
  href,
  active,
  counter,
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
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground max-md:py-2.5 icones:justify-center icones:px-0"
            />
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden />
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
              // `max-md:` = le tiroir seul (la barre fixe n'existe qu'à partir de `md`) : 40 px par
              // entrée au doigt, 36 px inchangés au pointeur. TCK-2480 — `min-w-0 flex-1` : le lien
              // partage la ligne avec son épingle ; `relative` : le compteur se pose sur l'icône
              // quand la barre est réduite.
              'relative flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors max-md:py-2.5 icones:justify-center icones:px-0',
              FOCUS_RING,
              active ? 'bg-border text-foreground font-semibold' : 'text-muted-foreground hover:bg-muted',
              emphasized && !active && 'text-foreground font-semibold',
            )}
          />
        }
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className={LIBELLE_DE_LIGNE}>{label}</span>
        {counterKey && counter && counter > 0 ? (
          <SidebarCounter value={counter} label={libelleCompteur(counterKey, counter)} />
        ) : null}
        {/* `md:hidden` : à partir de `md`, la pastille de la barre haute porte déjà le solde — la
            valeur ne s'affiche que dans le tiroir, le « menu mobile » de `/app`. */}
        {valeur !== undefined ? (
          <span
            data-slot="valeur-entree"
            className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground md:hidden"
          >
            {valeur}
          </span>
        ) : null}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
  if (!epingle) return lien;
  const refusee = epingle.plein && !epingle.epinglee;
  // TCK-2480 — l'épingle est une SŒUR du lien (un bouton dans un lien n'est pas valide) : bouton à
  // bascule, nom constant, état dans `aria-pressed`. Refusée (A7, cinq épingles), elle reste
  // atteignable et dit pourquoi (`aria-disabled` + `title`), au lieu de disparaître.
  return (
    <div className="group/ligne flex items-center">
      {lien}
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
    </div>
  );
}

function SidebarUserFooter({ user, onNavigate }: { user: User; onNavigate?: () => void }) {
  const t = useTranslations('nav');
  // TCK-623 — un compte sans nom (téléphone, OAuth) : une silhouette, et ce qui désigne le compte.
  const initials = initialesDe(user);
  const libelle = libelleDe(user) ?? t('accountFallback');
  return (
    <Link
      href="/app/profile"
      onClick={onNavigate}
      className={cn('flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted icones:justify-center icones:px-0', FOCUS_RING)}
    >
      <Avatar className="size-9">
        {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={libelle} /> : null}
        <AvatarFallback className="bg-foreground text-white">
          {initials ?? <UserRound className="size-4" aria-hidden="true" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 icones:sr-only">
        <p className="truncate text-sm font-semibold text-foreground">{libelle}</p>
        <p className="truncate text-xs text-muted-foreground">{t('myProfile')}</p>
      </div>
    </Link>
  );
}

/**
 * TCK-377 — AC6 : quels compteurs sont réellement sondés.
 *
 * Le sondage est armé par la PRÉSENCE de l'entrée comptée, jamais par une liste de rôles recopiée
 * à côté de la condition qui pousse l'entrée : *deux listes de rôles finissent toujours par
 * diverger, une liste dérivée non.* Une entrée cadenassée ne compte pas non plus — le cadenas
 * signifie que la page répondra 403, et un menu ne sonde pas une porte fermée.
 *
 * ⚠ **Ce paragraphe disait l'inverse jusqu'au 2026-08-27**, et la correction est le fait le plus
 * important de cet AC. Il annonçait « aucun des sept rôles ne déclenche la branche `false` », ce
 * qui était vrai du code de TCK-377 seul : `/app/visits` y était poussée sans garde de rôle. **Le
 * même lot a fusionné TCK-379, qui la retire au `service_provider`** — la branche `false` est donc
 * ATTEINTE par un rôle réel (`service_provider` → `{unreadMessages}` seul), et c'est précisément à
 * ce moment-là que plus rien ne l'observait : la mutation « les deux compteurs armés en dur »
 * laissait les 88 tests verts.
 *
 * Elle est désormais éprouvée **sur le composant monté**, rôle par rôle
 * (`AppSidebar.test.tsx`, AC6) : une fonction pure verte ne dit rien de ce que le composant en
 * fait.
 *
 * TCK-2478 — les entrées sont celles des groupes du menu composé (`entreesDuMenu`), repliés
 * compris : une entrée repliée est au menu, son compteur est sondé.
 */
export function countersToPoll(
  entrees: readonly { readonly counterKey?: NavCounterKey; readonly locked?: boolean }[],
): Set<NavCounterKey> {
  const keys = new Set<NavCounterKey>();
  for (const entree of entrees) {
    if (entree.counterKey && !entree.locked) keys.add(entree.counterKey);
  }
  return keys;
}

interface GroupeDuMenuProps {
  readonly groupe: GroupeCompose & { readonly entrees: readonly EntreeRendue[] };
  /** TCK-377 — les titres de SECTION paraissent (`avecTitres`). */
  readonly titres: boolean;
  readonly premier: boolean;
  readonly idBase: string;
  readonly activeHref: string | null;
  readonly rendreEntree: (entree: EntreeRendue) => ReactNode;
  /**
   * TCK-2480 — replier ou ouvrir le groupe, ENREGISTRÉ sur le compte (A8). Absent (aucun
   * fournisseur) : seuls les groupes repliés par défaut se basculent, pour ce montage seulement.
   */
  readonly onBasculer?: (groupe: string, replie: boolean, replieParDefaut: boolean) => void;
  /** TCK-2480 — la barre est réduite MAINTENANT : le titre du bouton de bascule passe en infobulle. */
  readonly infobulle: boolean;
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
  const libelle = groupe.titre !== null ? t(`groupes.${groupe.titre}`, groupe.titreValeurs) : null;
  const idTitre = `${idBase}-${groupe.id}-titre`;
  const idListe = `${idBase}-${groupe.id}-liste`;

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
      className={cn('space-y-1', !premier && 'mt-4 icones:mt-2')}
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
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-1 text-left hover:text-foreground max-md:py-2 icones:justify-center icones:px-0',
                  STYLE_TITRE,
                  FOCUS_RING,
                )}
              />
            }
          >
            <span className={LIBELLE_DE_LIGNE}>{libelle}</span>
            <ChevronRight
              aria-hidden
              className={cn('size-3.5 shrink-0 transition-transform motion-reduce:transition-none', ouvert && 'rotate-90')}
            />
          </TooltipTrigger>
          <TooltipContent side="right">{libelle}</TooltipContent>
        </Tooltip>
      ) : avecTitre ? (
        <>
          <p id={idTitre} className={cn('px-3 pb-1 icones:sr-only', STYLE_TITRE)}>
            {libelle}
          </p>
          <div aria-hidden className="mx-2 my-1 hidden h-px bg-border icones:block" />
        </>
      ) : null}
      <div id={idListe} hidden={bascule && !ouvert} className="space-y-1">
        {groupe.entrees.map(rendreEntree)}
      </div>
    </div>
  );
}

interface LienDePiedProps {
  readonly href: string;
  readonly icone: LucideIcon;
  readonly libelle: string;
  readonly infobulle: boolean;
  readonly onNavigate?: () => void;
  readonly className?: string;
}

/** TCK-2480 — un lien de pied de barre (console, carte réduite) : icône et libellé ; réduite, une infobulle. */
function LienDePied({ href, icone: Icone, libelle, infobulle, onNavigate, className }: LienDePiedProps) {
  return (
    <Tooltip disabled={!infobulle}>
      <TooltipTrigger
        render={
          <Link
            href={href}
            onClick={onNavigate}
            className={cn(
              'mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted max-md:py-2.5 icones:justify-center icones:px-0',
              FOCUS_RING,
              className,
            )}
          />
        }
      >
        <Icone className="size-4 shrink-0" aria-hidden />
        <span className={LIBELLE_DE_LIGNE}>{libelle}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{libelle}</TooltipContent>
    </Tooltip>
  );
}

interface BasculeDesIconesProps {
  readonly mode: ModeIcones;
  readonly infobulle: boolean;
  readonly onBasculer: () => void;
}

/**
 * TCK-2480 (A10) — le bouton du pied de barre : il choisit le mode explicite OPPOSÉ à l'état effectif.
 * Son nom suit l'état : en `auto`, les deux libellés sont rendus et le CSS en montre un (le serveur ne
 * sait pas lequel) ; en mode explicite, un seul.
 */
function BasculeDesIcones({ mode, infobulle, onBasculer }: BasculeDesIconesProps) {
  const t = useTranslations('nav.sidebar.icones');
  const auto = mode === 'auto';
  return (
    <Tooltip disabled={!infobulle}>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-slot="bascule-icones"
            onClick={onBasculer}
            className={cn(
              'mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted icones:justify-center icones:px-0',
              FOCUS_RING,
            )}
          />
        }
      >
        {mode !== 'icones' ? <PanelLeftClose className={cn('size-4 shrink-0', auto && 'icones:hidden')} aria-hidden /> : null}
        {mode !== 'complet' ? (
          <PanelLeftOpen className={cn('size-4 shrink-0', auto && 'hidden icones:block')} aria-hidden />
        ) : null}
        {mode !== 'icones' ? <span className={auto ? 'icones:hidden' : undefined}>{t('reduire')}</span> : null}
        {mode !== 'complet' ? <span className={auto ? 'hidden icones:inline icones:sr-only' : 'sr-only'}>{t('deplier')}</span> : null}
      </TooltipTrigger>
      <TooltipContent side="right">{infobulle ? t('deplier') : t('reduire')}</TooltipContent>
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
  tiroir = false,
}: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const locale = useCurrentLocale();
  const idBase = useId();
  const { token } = useAuth();
  const accesAdmin = useAccesAdminOuRepli({
    roles: user.roles,
    agencyId: user.agency_id,
    agencyIsStandard,
  });
  // P152.03 — les capacités du profil actif, lues pour le seul personnel (le cache est amorcé par le
  // layout pour l'admin d'agence, `AmorceCapacites`). Le super-admin passe tout, sans lecture.
  const lireCapacites = (isAgent(user.roles) || isAdmin(user.roles)) && !isSuperAdmin(user.roles);
  const { data: mesCapacites } = useMyCapabilities(undefined, lireCapacites);
  const capacites = lireCapacites ? (mesCapacites?.data.capabilities ?? null) : [];

  // TCK-2478 (ADR-0089) — LE menu : la disposition du persona du profil actif, composée par une
  // fonction pure. Ce composant n'affiche que ce qu'elle rend, et ne porte aucune condition de rôle
  // — hormis le cadenas de l'agence `individual` (`isProRouteLocked`), qui est un confort d'écran.
  // TCK-2480 — `personaDeLaCoque` : la MÊME formule que le fournisseur des préférences (`AppShell`).
  const persona = personaDeLaCoque({
    roles: user.roles,
    typeProfilActif,
    espaceIndividuel: accesAdmin.espaceIndividuel,
    agencyIsStandard,
  });
  const ctxMenu = { roles: user.roles, capacites, cheminsAdmin: accesAdmin.chemins, agenceSuspendue: agencySuspended };
  // TCK-2480 — les préférences du compte, PAR PERSONA (un geste n'écrit que sous le persona affiché) ;
  // sans fournisseur, aucune (repli inerte, A12).
  const prefs = usePreferencesDuMenu();
  const menu = composerMenu(ctxMenu, persona, undefined, prefsDe(prefs.navigation, persona));
  // TCK-2480 (A10, A11) — le mode de l'appareil : `data-menu` sur la barre, la largeur en CSS
  // (variante `icones:`). Les variantes compactes ne sont RENDUES que si la barre peut se réduire.
  const modeIcones: ModeIcones = tiroir ? 'complet' : prefs.modeIcones;
  const reductible = modeIcones !== 'complet';
  const infobulle = useIconesEffectives(modeIcones);
  const verrouiller = (e: EntreeComposee): EntreeRendue => ({
    ...e,
    locked: isProRouteLocked(user, agencyIsStandard, e.href),
  });
  const groupes = menu.groupes.map((g) => ({ ...g, entrees: g.entrees.map(verrouiller) }));
  const entrees: EntreeRendue[] = groupes.flatMap((g) => g.entrees);
  const lien = (e: EntreeComposee) => (e.publique ? cheminLocalise(e.href, locale) : e.href);

  const counted = countersToPoll(entrees);
  const unreadMessages = useUnreadCount({ enabled: counted.has('unreadMessages') });
  const pendingVisits = usePendingVisitsCount({ enabled: counted.has('pendingVisits') });
  const unhandledLeads = useUnhandledLeadsCount({ enabled: counted.has('unhandledLeads') });
  // TCK-649 — les deux files de modération, reprises à l'identique de la barre de l'ancienne
  // console (TCK-098) : mêmes clés de cache — celle des biens est partagée avec le bloc de files du
  // tableau de bord d'agence (TCK-375), qui vit désormais dans la MÊME coque —, même cadence.
  const { data: avisEnAttente, isError: avisEnErreur } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    // TCK-2479 (revue, I3) — le total de la vue où mène la pastille, pas `pending_count` : voir
    // `COMPTE_DES_AVIS_EN_ATTENTE`.
    queryFn: () => fetchModerationQueue(token ?? '', COMPTE_DES_AVIS_EN_ATTENTE).then((r) => r.meta),
    enabled: Boolean(token) && counted.has('reviewModeration'),
    refetchInterval: AGENCY_QUEUE_REFETCH_INTERVAL_MS,
    staleTime: AGENCY_QUEUE_STALE_TIME_MS,
  });
  const optionsBiens = propertyModerationCountQueryOptions(token ?? null, agencyIsStandard);
  const { data: biensEnAttente, isError: biensEnErreur } = useQuery({
    ...optionsBiens,
    enabled: optionsBiens.enabled && counted.has('propertyModeration'),
  });
  // TCK-2479 (ADR-0089 §5) — 0 pendant le chargement ET sur une erreur, premier échec ou relecture
  // ratée (react-query garde alors l'ancien `data` : ce commentaire disait « une requête en échec
  // rend `data === undefined` », vrai du premier échec seulement). C'est la même branche que « rien
  // en attente » — délibérément : le menu n'est pas l'endroit où l'on apprend qu'un endpoint est
  // tombé. Le badge du menu et la bande lisent ce MÊME objet.
  const total = (q: {
    readonly data?: { readonly meta?: { readonly total?: number } };
    readonly isError?: boolean;
  }) => (q.isError ? 0 : (q.data?.meta?.total ?? 0));
  const counters: Record<NavCounterKey, number> = {
    unreadMessages,
    pendingVisits: total(pendingVisits),
    unhandledLeads: total(unhandledLeads),
    reviewModeration: avisEnErreur ? 0 : (avisEnAttente?.total ?? 0),
    propertyModeration: biensEnErreur ? 0 : (biensEnAttente ?? 0),
  };
  // TCK-2479 — la bande : les entrées RENDUES (donc sondées, `countersToPoll`), dans l'ordre du
  // persona. Elle ne lit aucun compteur de plus que le menu.
  const bande = pastillesATraiter(entrees, counters, menu.priorites);
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
      : action.labelSpace === 'nav.admin'
        ? tAdmin(action.labelKey)
        : t(action.labelKey)
    : null;
  const IconeAction = action?.icon;
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

  const rendreEntree = (entree: EntreeRendue) => (
    <SidebarItem
      key={entree.href}
      entree={entree}
      href={lien(entree)}
      active={entree.href === activeHref}
      counter={entree.counterKey ? counters[entree.counterKey] : undefined}
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
  const [epingles, autres] = groupes[0]?.id === 'epingles' ? [groupes[0], groupes.slice(1)] : [null, groupes];
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
    />
  );

  return (
    <aside
      ref={barre}
      data-menu={modeIcones}
      className={cn(
        'flex h-full w-64 flex-col bg-card transition-[width] duration-200 motion-reduce:transition-none icones:w-16 icones:pt-5',
        className,
      )}
    >
      {/* Revue design 2026-09-16 — à partir de `md`, la barre haute porte déjà la marque, 60 px
          au-dessus : le second logo ne se lisait que comme un doublon. Il reste dans le tiroir,
          où la barre haute est recouverte. `-mx-1 px-1` : l'anneau de focus — posé sur ce lien
          à l'ouverture du tiroir — ne rase plus les glyphes. */}
      <div className="px-5 py-5 md:hidden">
        <Link
          href="/"
          onClick={onNavigate}
          className={cn('inline-flex rounded-md px-1 py-1', FOCUS_RING)}
        >
          <Logo nom={tCommon('appName')} />
        </Link>
      </div>
      {/* TCK-2478 — l'en-tête d'espace : l'agence et le persona, et le sélecteur de profil. Il porte
          le `md:pt-5` qu'avait le `<nav>` : c'est désormais lui qui ouvre la barre. */}
      <EnTeteDEspace user={user} persona={persona} />
      {/* TCK-2478 — l'action principale du persona : la seule surface de couleur primaire du menu,
          et le premier lien atteint au clavier après l'en-tête. Absente (jamais désactivée) quand
          le profil ne peut pas l'accomplir — dont l'espace suspendu (TCK-600). */}
      {action && IconeAction ? (
        <div className="px-3 pb-3">
          {/* TCK-2480 (A11) — réduite : un carré plein, le libellé en infobulle (et toujours lu). */}
          <Tooltip disabled={!infobulle}>
            <TooltipTrigger
              render={
                <Link
                  href={lien(action)}
                  onClick={onNavigate}
                  data-slot="action-principale"
                  aria-current={actionCourante ? 'page' : undefined}
                  className={cn(
                    'flex items-start gap-3 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 max-md:py-2.5 icones:justify-center icones:px-0',
                    FOCUS_RING,
                  )}
                />
              }
            >
              {/* `mt-0.5` : l'icône (16 px) se centre sur la PREMIÈRE ligne (`leading-snug`, ~19 px), et
                  non sur le bloc entier quand le libellé passe à la ligne. */}
              <IconeAction className="mt-0.5 size-4 shrink-0 icones:mt-0" aria-hidden />
              {/* TCK-2478 — mesuré au navigateur : « Proposer un bien à mon agence » était tronqué
                  (ellipse) à 1366, 768 et 390 px. L'action dit ce qu'elle fait en entier : elle passe
                  à la ligne, jamais d'ellipse. */}
              <span className="min-w-0 text-left leading-snug text-pretty icones:sr-only">{libelleAction}</span>
            </TooltipTrigger>
            <TooltipContent side="right">{libelleAction}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      {/* TCK-2479 (ADR-0089 §5) — ce qui attend une réponse, HORS du `<nav>` : le menu ne bouge
          jamais selon un compteur. Rien n'est rendu quand rien n'attend. Le tiroir monte la même
          barre : la bande y est aussi. */}
      <BandeATraiter visibles={bande.visibles} autres={bande.autres} onNavigate={onNavigate} reductible={reductible} />
      {/* TCK-843 — `relative` : bloc conteneur des `sr-only` (absolus) de la liste. Sans lui,
          c'était la fenêtre ; aucun `overflow` ne les coupait, et posés en bas de la liste ils
          allongeaient le document — la coque entière de `/app` défilait. */}
      <nav aria-label={t('navLabel')} className="relative flex-1 overflow-y-auto px-3 pb-2">
        {/* TCK-2480 (A6) — « Épinglés » d'abord : juste sous la bande « À traiter », avant « Démarrer »,
            qui est transitoire. */}
        {epingles ? rendreGroupe(epingles, true) : null}
        {/* TCK-2479 — « Démarrer » : un espace neuf sait par où commencer. Dans le `<nav>`, il défile
            avec le menu ; il n'en réordonne aucune entrée. `menu.demarrer` est `null` pour un persona
            sans mise en service, dans un espace suspendu, et (TCK-2480, A9) masqué par l'utilisateur
            pour ce persona : ni groupe, ni lecture. */}
        {menu.demarrer ? (
          <DemarrerDeLEspace
            mode={menu.demarrer}
            ouverte={(href) => cheminOuvert(ctxMenu, href)}
            onNavigate={onNavigate}
            onMasquer={prefs.actif ? () => prefs.masquerDemarrer(persona) : undefined}
            // TCK-2480 — réduite, « Démarrer » (des étapes à lire) se cache : il revient barre dépliée.
            className={cn(epingles && 'mt-4', 'icones:hidden')}
          />
        ) : null}
        {/* `premier` : sans « Épinglés », le premier groupe ouvre le menu (la marge basse de
            « Démarrer », qui peut ne rien rendre, ne se double pas d'une marge haute). */}
        {autres.map((groupe, index) => rendreGroupe(groupe, index === 0 && epingles === null))}
      </nav>
      <div className="px-3 pb-4">
        {/* TCK-2480 (A11) — réduite : la carte devient une icône, la carte « Passer en pro » se cache ;
            le pied garde la console, la bascule et l'avatar. */}
        {menu.carte ? (
          <>
            <div className={reductible ? 'icones:hidden' : undefined}>
              <CarteDeMiseEnLocation href={lien(menu.carte)} onNavigate={onNavigate} />
            </div>
            {reductible ? (
              <LienDePied
                href={lien(menu.carte)}
                icone={Home}
                libelle={t('carteLocation.titre')}
                infobulle={infobulle}
                onNavigate={onNavigate}
                className="hidden icones:flex"
              />
            ) : null}
          </>
        ) : null}
        {showProUpgradeCard ? (
          <div className="icones:hidden">
            <ProUpgradeCard pending={Boolean(hasPendingUpgrade)} onNavigate={onNavigate} />
          </div>
        ) : null}
        {/* Revue de TCK-2478 — la console suit le RÔLE, pas le persona : un super-admin dont le profil
            actif est d'agence (persona `admin-agence`) la perdait. La console garde sa propre porte. */}
        {isSuperAdmin(user.roles) ? (
          <LienDePied href={HREF_CONSOLE} icone={ShieldCheck} libelle={t('console')} infobulle={infobulle} onNavigate={onNavigate} />
        ) : null}
        {/* TCK-2480 (A10) — la bascule de l'appareil : jamais dans le tiroir, jamais sans fournisseur. */}
        {!tiroir && prefs.actif ? (
          <BasculeDesIcones
            mode={modeIcones}
            infobulle={infobulle}
            onBasculer={() => prefs.choisirModeIcones(infobulle ? 'complet' : 'icones')}
          />
        ) : null}
        <SidebarUserFooter user={user} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
