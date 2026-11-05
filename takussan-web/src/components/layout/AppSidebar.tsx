'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Lock, ShieldCheck, UserRound } from 'lucide-react';
import type { User } from '@/types/user';
import { isAgent, isAdmin, isSuperAdmin } from '@/lib/roles';
import { useMyCapabilities } from '@/hooks/useCan';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import { useAuth } from '@/context/AuthContext';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import {
  AGENCY_QUEUE_REFETCH_INTERVAL_MS,
  AGENCY_QUEUE_STALE_TIME_MS,
  propertyModerationCountQueryOptions,
} from '@/lib/queries/agency-queues';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  composerMenu,
  type EntreeComposee,
  type GroupeCompose,
} from '@/lib/navigation/composer-menu';
import { DISPOSITIONS } from '@/lib/navigation/dispositions';
import { resoudrePersona } from '@/lib/navigation/personas';
import type { ProfileType } from '@/types/profile';
import { useSoldeCredits } from '@/lib/queries/credits-solde';
import { useUnreadCount } from '@/components/chat-widget/useUnreadCount';
import { usePendingVisitsCount } from '@/lib/queries/visits';
import { useUnhandledLeadsCount } from '@/lib/queries/contact-leads';

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
}

/**
 * TCK-377 — Anneau de focus sur toutes les cibles cliquables de la barre.
 *
 * Il n'y en avait AUCUN : au clavier, seul le contour par défaut du navigateur subsistait. Le
 * jeton `--ring` (#a85332) mesure 5,32:1 sur le fond réel de l'aside (`--card` = #ffffff) et
 * 4,23:1 sur le fond de l'entrée ACTIVE (`--border` = #ebe5d5) — au-dessus du seuil non-texte de
 * 3:1 dans les deux cas, ce qui rend le `ring-offset` inutile ici. ⚠ Le jumeau super-admin
 * (TCK-359) a dû l'ajouter parce que là-bas `--ring` et `--sidebar-primary` se confondent sur
 * fond sombre ; ce n'est pas le cas sur la palette claire de `/app`, mesuré et non déduit.
 */
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Le titre d'un groupe, en petites capitales (section ou bouton de bascule). */
const STYLE_TITRE = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground';

function SidebarCounter({ value, label }: { value: number; label: string }) {
  return (
    <span
      aria-label={label}
      className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
    >
      {value > 99 ? '99+' : value}
    </span>
  );
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
}

function SidebarItem({ entree, href, active, counter, onNavigate, valeur, nomAccessible }: SidebarItemProps) {
  const { labelKey, labelSpace, icon: Icon, emphasized, locked, counterKey } = entree;
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const label = labelSpace === 'nav.admin' ? tAdmin(labelKey) : t(labelKey);
  const libelleCompteur = (cle: NavCounterKey, count: number) =>
    COMPTEURS_DE_MODERATION.has(cle) ? tAdmin('pendingBadge', { count }) : t(`counters.${cle}`, { count });

  if (locked) {
    return (
      <span
        role="link"
        aria-disabled="true"
        tabIndex={0}
        title={t('proLocked')}
        className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground max-md:py-2.5"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <span className="sr-only">{t('proLocked')}</span>
        <Lock className="ml-auto size-3.5 shrink-0" aria-hidden />
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={nomAccessible}
      className={cn(
        // `max-md:` = le tiroir seul (la barre fixe n'existe qu'à partir de `md`) : 40 px par
        // entrée au doigt, 36 px inchangés au pointeur.
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors max-md:py-2.5',
        FOCUS_RING,
        active
          ? 'bg-border text-foreground font-semibold'
          : 'text-muted-foreground hover:bg-muted',
        emphasized && !active && 'text-foreground font-semibold',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
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
    </Link>
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
      className={cn('flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted', FOCUS_RING)}
    >
      <Avatar className="size-9">
        {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={libelle} /> : null}
        <AvatarFallback className="bg-foreground text-white">
          {initials ?? <UserRound className="size-4" aria-hidden="true" />}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
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
  /** TCK-377 — les titres de SECTION paraissent (`avecTitres`). Sans effet sur une bascule. */
  readonly titres: boolean;
  readonly premier: boolean;
  readonly idBase: string;
  readonly activeHref: string | null;
  readonly rendreEntree: (entree: EntreeRendue) => ReactNode;
}

/**
 * TCK-2478 — un groupe de la disposition.
 *
 * - « Plus » et « Aussi … » sont des DIVULGATIONS (`GROUPES_DIVULGATION`) : leur bouton de bascule
 *   se rend toujours, titres de section ou non (décision de la session du 2026-11-05 : le
 *   prestataire garde son « Plus » sans qu'aucun titre de section paraisse — AC5).
 * - Un autre groupe replié par sa disposition (« Agence », « Pilotage », « Mes recherches » du
 *   locataire) est titré : son titre EST le bouton de bascule.
 * - Un groupe déplié par sa disposition ne montre son titre que si `titres` (TCK-377).
 *
 * AC4 — l'entrée active n'est jamais cachée : un groupe qui la contient s'ouvre de lui-même, au
 * montage comme à la navigation (la barre survit aux navigations du layout). L'ajustement se fait
 * pendant le rendu, sur le patron « état dérivé d'une prop » de React, sans effet.
 */
function GroupeDuMenu({ groupe, titres, premier, idBase, activeHref, rendreEntree }: GroupeDuMenuProps) {
  const t = useTranslations('nav.sidebar');
  const contientLActif = activeHref !== null && groupe.entrees.some((e) => e.href === activeHref);
  const [ouvert, setOuvert] = useState(!groupe.replie || contientLActif);
  const [actifVu, setActifVu] = useState(contientLActif);
  if (contientLActif !== actifVu) {
    setActifVu(contientLActif);
    if (contientLActif) setOuvert(true);
  }

  const bascule = groupe.replie && groupe.titre !== null;
  const avecTitre = groupe.titre !== null && (bascule || titres || GROUPES_DIVULGATION.has(groupe.id));
  const libelle = groupe.titre !== null ? t(`groupes.${groupe.titre}`, groupe.titreValeurs) : null;
  const idTitre = `${idBase}-${groupe.id}-titre`;
  const idListe = `${idBase}-${groupe.id}-liste`;

  return (
    // Un groupe titré se lit comme un GROUPE : le lecteur d'écran annonce son nom en y entrant
    // (« Activité, groupe »), comme l'œil lit l'en-tête.
    <div
      role={avecTitre ? 'group' : undefined}
      aria-labelledby={avecTitre ? idTitre : undefined}
      data-groupe={groupe.id}
      className={cn('space-y-1', !premier && 'mt-4')}
    >
      {avecTitre && bascule ? (
        <button
          type="button"
          id={idTitre}
          aria-expanded={ouvert}
          aria-controls={idListe}
          onClick={() => setOuvert((v) => !v)}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md px-3 py-1 text-left hover:text-foreground max-md:py-2',
            STYLE_TITRE,
            FOCUS_RING,
          )}
        >
          <span className="truncate">{libelle}</span>
          <ChevronRight
            aria-hidden
            className={cn('size-3.5 shrink-0 transition-transform motion-reduce:transition-none', ouvert && 'rotate-90')}
          />
        </button>
      ) : avecTitre ? (
        <p id={idTitre} className={cn('px-3 pb-1', STYLE_TITRE)}>
          {libelle}
        </p>
      ) : null}
      <div id={idListe} hidden={bascule && !ouvert} className="space-y-1">
        {groupe.entrees.map(rendreEntree)}
      </div>
    </div>
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
  const persona = resoudrePersona({
    roles: user.roles,
    typeProfilActif: typeProfilActif ?? null,
    agenceIndividuelle: accesAdmin.espaceIndividuel || agencyIsStandard === false,
  });
  const menu = composerMenu(
    { roles: user.roles, capacites, cheminsAdmin: accesAdmin.chemins, agenceSuspendue: agencySuspended },
    persona,
  );
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
  const { data: avisEnAttente } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () => fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    enabled: Boolean(token) && counted.has('reviewModeration'),
    refetchInterval: AGENCY_QUEUE_REFETCH_INTERVAL_MS,
    staleTime: AGENCY_QUEUE_STALE_TIME_MS,
  });
  const optionsBiens = propertyModerationCountQueryOptions(token ?? null, agencyIsStandard);
  const { data: biensEnAttente } = useQuery({
    ...optionsBiens,
    enabled: optionsBiens.enabled && counted.has('propertyModeration'),
  });
  // Une requête en échec rend `data === undefined` : le compteur vaut 0, et 0 ne s'affiche pas.
  // C'est la même branche que « rien en attente » — délibérément : le menu n'est pas l'endroit
  // où l'on apprend qu'un endpoint est tombé.
  const counters: Record<NavCounterKey, number> = {
    unreadMessages,
    pendingVisits: pendingVisits.data?.meta.total ?? 0,
    unhandledLeads: unhandledLeads.data?.meta?.total ?? 0,
    reviewModeration: avisEnAttente?.pending_count ?? 0,
    propertyModeration: biensEnAttente ?? 0,
  };
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
    />
  );

  return (
    <aside className={cn('flex h-full w-64 flex-col bg-card', className)}>
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
          <Link
            href={lien(action)}
            onClick={onNavigate}
            data-slot="action-principale"
            aria-current={actionCourante ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 max-md:py-2.5',
              FOCUS_RING,
            )}
          >
            <IconeAction className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{libelleAction}</span>
          </Link>
        </div>
      ) : null}
      {/* TCK-843 — `relative` : bloc conteneur des `sr-only` (absolus) de la liste. Sans lui,
          c'était la fenêtre ; aucun `overflow` ne les coupait, et posés en bas de la liste ils
          allongeaient le document — la coque entière de `/app` défilait. */}
      <nav aria-label={t('navLabel')} className="relative flex-1 overflow-y-auto px-3 pb-2">
        {groupes.map((groupe, index) => (
          <GroupeDuMenu
            key={groupe.id}
            groupe={groupe}
            titres={titres}
            premier={index === 0}
            idBase={idBase}
            activeHref={activeHref}
            rendreEntree={rendreEntree}
          />
        ))}
      </nav>
      <div className="px-3 pb-4">
        {menu.carte ? <CarteDeMiseEnLocation href={lien(menu.carte)} onNavigate={onNavigate} /> : null}
        {showProUpgradeCard ? (
          <ProUpgradeCard pending={Boolean(hasPendingUpgrade)} onNavigate={onNavigate} />
        ) : null}
        {/* Revue de TCK-2478 — la console suit le RÔLE, pas le persona : un super-admin dont le profil
            actif est d'agence (persona `admin-agence`) la perdait. La console garde sa propre porte. */}
        {isSuperAdmin(user.roles) ? (
          <Link
            href={HREF_CONSOLE}
            onClick={onNavigate}
            className={cn(
              'mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted max-md:py-2.5',
              FOCUS_RING,
            )}
          >
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t('console')}</span>
          </Link>
        ) : null}
        <SidebarUserFooter user={user} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
