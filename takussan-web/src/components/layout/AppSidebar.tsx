'use client';

import { useId } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Lock, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { isAgent, isAdmin, isSuperAdmin } from '@/lib/roles';
import { useMyCapabilities } from '@/hooks/useCan';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { entreesDeMenu, type AccesAdmin, type CheminAdmin } from '@/lib/access/pages-admin';
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
import { useFormatter, useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import { initialesDe, libelleDe } from '@/lib/identite';
import { APP_EXACT_ROOTS, resolveActiveHref } from '@/lib/navigation/active-path';
import { HREF_CREDITS } from '@/lib/navigation/acces-app';
import {
  SECTION_LABEL_KEYS,
  SECTION_ORDER,
  type NavCounterKey,
  type NavSection,
} from '@/lib/navigation/types';
import { menuDuPersona } from '@/lib/navigation/composer-menu';
import { resoudrePersona } from '@/lib/navigation/personas';
import type { ProfileType } from '@/types/profile';
import { useSoldeCredits } from '@/lib/queries/credits-solde';
import { useUnreadCount } from '@/components/chat-widget/useUnreadCount';
import { usePendingVisitsCount } from '@/lib/queries/visits';
import { useUnhandledLeadsCount } from '@/lib/queries/contact-leads';

// TCK-2477 — déplacés vers `@/lib/navigation/types` (avec leurs docblocks) ; ré-exportés pour les
// appelants existants.
export { SECTION_LABEL_KEYS, SECTION_ORDER };
export type { NavCounterKey, NavSection };

/** Compteurs dont le libellé accessible vit sous `nav.admin` (`pendingBadge`), pas `nav.sidebar`. */
const COMPTEURS_DE_MODERATION: ReadonlySet<NavCounterKey> = new Set([
  'reviewModeration',
  'propertyModeration',
]);

/**
 * Une entrée porte une CLÉ de libellé, pas un libellé.
 *
 * `composerMenu` (`@/lib/navigation/composer-menu`) est une fonction pure appelée hors composant :
 * `useTranslations` n'y est pas appelable, et l'y rendre appelable voudrait dire la transformer en
 * hook — donc la rendre intestable et non mémoïsable. Le patron retenu est celui que TCK-286 applique partout où le
 * texte naît loin de l'écran : **la donnée transporte la clé, le rendu la résout**.
 */
export interface NavItem {
  /** TCK-2477 — l'identifiant de la destination au catalogue (`@/lib/navigation/catalogue`). */
  id?: string;
  href: string;
  labelKey: string;
  icon: LucideIcon;
  section: NavSection;
  emphasized?: boolean;
  locked?: boolean;
  counterKey?: NavCounterKey;
  /** TCK-633 — espace de la clé de libellé ; `nav.sidebar` par défaut, `nav.admin` pour la section d'agence. */
  labelSpace?: 'nav.admin';
}

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
}

/**
 * @deprecated TCK-2477 — adaptateur du moteur (`@/lib/navigation`, ADR-0089). Il garde la
 * signature d'avant pour que les tests qui figent le menu des sept rôles passent SANS retouche ;
 * TCK-2478 les réécrit sur le moteur et retire cet adaptateur.
 *
 * L'historique des gardes de chaque entrée (TCK-379, TCK-492, TCK-587, TCK-625, TCK-646,
 * P152.03…) vit désormais sur sa destination, dans `@/lib/navigation/catalogue`.
 */
export function buildNavItems(
  user: User,
  capacites: readonly string[] | null = null,
  typeProfilActif: ProfileType | null = null,
  agenceIndividuelle = false,
): NavItem[] {
  const persona = resoudrePersona({ roles: user.roles, typeProfilActif, agenceIndividuelle });
  return menuDuPersona({ roles: user.roles, capacites }, persona);
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

/** Les pages de la section d'agence qui portent le compte d'une file d'attente. */
const COMPTEUR_DE_PAGE: Partial<Record<CheminAdmin, NavCounterKey>> = {
  '/app/agency/moderation': 'reviewModeration',
  '/app/agency/moderation/properties': 'propertyModeration',
};

/**
 * TCK-649 (ADR-0064 §2, AC2) — la section d'agence du menu, DÉRIVÉE de la table des pages.
 *
 * Une entrée par page à menu que le profil actif peut ouvrir (`entreesDeMenu`), dans l'ordre de la
 * table, avec son libellé et son icône ; aucune s'il n'en a aucune — la section disparaît alors
 * avec ses entrées ({@link groupBySection}). Elle remplace l'entrée unique « Administration » de
 * TCK-633, qui faisait changer de coque au clic.
 *
 * ⚠ C'est la TABLE qui dit qui voit quoi, jamais ce composant : aucune condition de rôle ici.
 */
export function avecSectionAgence(items: NavItem[], acces: AccesAdmin): NavItem[] {
  const section = entreesDeMenu(acces).map(
    (entree): NavItem => ({
      href: entree.chemin,
      labelKey: entree.cle,
      icon: entree.icone,
      section: 'admin',
      labelSpace: 'nav.admin',
      counterKey: COMPTEUR_DE_PAGE[entree.chemin],
    }),
  );
  return [...items, ...section];
}

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

function SidebarItem({
  href,
  labelKey,
  icon: Icon,
  active,
  emphasized,
  locked,
  counterKey,
  counter,
  onNavigate,
  labelSpace,
  valeur,
  nomAccessible,
}: NavItem & {
  active: boolean;
  counter?: number;
  onNavigate?: () => void;
  /** TCK-642 — une valeur en bout de ligne (le solde de crédits), déjà mise en forme. */
  valeur?: string;
  nomAccessible?: string;
}) {
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
 * Regroupe les entrées par section, dans l'ordre de {@link SECTION_ORDER}, en préservant l'ordre
 * de poussée à l'intérieur d'une section.
 *
 * Les sections vides ne rendent RIEN — c'est ce qui fait qu'un `customer`, qui n'a pas de
 * catalogue, ne voit pas de césure « Catalogue » vide. Et si le regroupement aboutissait à une
 * seule section non vide, les en-têtes disparaissent tous : *une césure unique ne coupe rien.*
 */
export function groupBySection(items: NavItem[]): { section: NavSection; items: NavItem[] }[] {
  const groups = SECTION_ORDER.map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);
  return groups;
}

/**
 * TCK-377 — « le groupement s'efface quand il n'a plus de travail à faire ».
 *
 * ⚠ Cette règle a d'abord été écrite `groups.length > 1`, **directement dans le composant**, et
 * elle y était doublement inerte :
 *
 *  1. **Aucun utilisateur ne la fait basculer.** `buildNavItems` pousse `/app` et `/app/messages`
 *     en `primary` et `/app/documents` en `engagements` SANS aucune condition de rôle : le
 *     minimum absolu est de DEUX groupes, y compris pour un compte sans aucun rôle. La branche
 *     `false` n'était donc atteignable par personne — et une règle qu'aucune entrée ne peut violer
 *     n'est pas gardable : la mutation `withHeadings = true` laissait les 88 tests verts.
 *  2. **Elle ne mesurait pas ce que la règle dit.** Ce qu'un en-tête doit gagner, c'est de la
 *     SÉPARATION ; une césure posée au-dessus d'UNE entrée n'en produit aucune. Compter les
 *     groupes ne le voit pas, compter les entrées d'un groupe le voit.
 *
 * La forme retenue garde l'ancienne clause et lui en ajoute une seconde, réellement atteignable :
 * les en-têtes ne paraissent que si **au moins une section LIBELLÉE porte deux entrées ou plus**.
 * `primary` est exclue de ce décompte parce qu'elle n'a pas de libellé ({@link SECTION_LABEL_KEYS})
 * — elle ne peut donc justifier aucune césure.
 *
 * Mesuré sur les sept rôles au 2026-08-27 : la seconde clause ne change le rendu que du
 * `service_provider`, qui recevait 2 en-têtes au-dessus d'UNE entrée chacune pour 4 entrées en
 * tout — exactement le cas que la Direction UX du ticket nomme. Les six autres rôles ont au moins
 * une section libellée à deux entrées et gardent leurs césures.
 */
export function withSectionHeadings(groups: { section: NavSection; items: NavItem[] }[]): boolean {
  if (groups.length <= 1) return false;
  return groups.some(
    (group) => SECTION_LABEL_KEYS[group.section] !== null && group.items.length > 1,
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
 */
export function countersToPoll(items: NavItem[]): Set<NavCounterKey> {
  const keys = new Set<NavCounterKey>();
  for (const item of items) {
    if (item.counterKey && !item.locked) keys.add(item.counterKey);
  }
  return keys;
}

export function AppSidebar({
  user,
  className,
  onNavigate,
  agencyIsStandard,
  hasPendingUpgrade,
  typeProfilActif,
}: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const idTitres = useId();
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
  const navItems = avecSectionAgence(
    buildNavItems(user, capacites, typeProfilActif ?? null, agencyIsStandard === false),
    accesAdmin,
  ).map((item) => ({
    ...item,
    locked: isProRouteLocked(user, agencyIsStandard, item.href),
  }));

  const counted = countersToPoll(navItems);
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
    enabled: navItems.some((item) => item.href === HREF_CREDITS && !item.locked),
  });

  const activeHref = resolveActiveHref(
    pathname,
    navItems.map((item) => item.href),
    APP_EXACT_ROOTS,
  );
  const groups = groupBySection(navItems);
  const withHeadings = withSectionHeadings(groups);

  const showProUpgradeCard =
    user.roles.includes('agency_admin') &&
    typeof user.agency_id === 'number' &&
    agencyIsStandard === false;

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
      {/* TCK-843 — `relative` : bloc conteneur des `sr-only` (absolus) de la liste. Sans lui,
          c'était la fenêtre ; aucun `overflow` ne les coupait, et posés en bas de la liste ils
          allongeaient le document — la coque entière de `/app` défilait. */}
      <nav aria-label={t('navLabel')} className="relative flex-1 overflow-y-auto px-3 pb-2 md:pt-5">
        {groups.map((group, index) => {
          const labelKey = SECTION_LABEL_KEYS[group.section];
          // TCK-649 — la section d'agence d'un admin `individual` s'appelle « Mon espace », comme
          // l'entrée unique qu'elle remplace (TCK-633).
          const titre = !withHeadings || labelKey === null
            ? null
            : group.section === 'admin' && accesAdmin.espaceIndividuel
              ? tAdmin('mySpace')
              : t(`sections.${labelKey}`);
          const idTitre = `${idTitres}-${group.section}`;
          // Une section titrée se lit comme un GROUPE : le lecteur d'écran annonce son nom en y
          // entrant (« Administration, groupe »), comme l'œil lit l'en-tête.
          return (
            <div
              key={group.section}
              role={titre ? 'group' : undefined}
              aria-labelledby={titre ? idTitre : undefined}
              className={cn('space-y-1', index > 0 && 'mt-4')}
            >
              {titre ? (
                <p
                  id={idTitre}
                  className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {titre}
                </p>
              ) : null}
              {group.items.map((item) => (
                <SidebarItem
                  key={item.href}
                  {...item}
                  active={item.href === activeHref}
                  counter={item.counterKey ? counters[item.counterKey] : undefined}
                  onNavigate={onNavigate}
                  {...(item.href === HREF_CREDITS && solde !== null
                    ? { valeur: format.number(solde), nomAccessible: tNav('creditsBalance', { count: solde }) }
                    : {})}
                />
              ))}
            </div>
          );
        })}
      </nav>
      <div className="px-3 pb-4">
        {showProUpgradeCard ? (
          <ProUpgradeCard pending={Boolean(hasPendingUpgrade)} onNavigate={onNavigate} />
        ) : null}
        <SidebarUserFooter user={user} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
