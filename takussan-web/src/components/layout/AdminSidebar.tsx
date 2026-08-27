'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  ShieldCheck,
  FileText,
  KeyRound,
  Settings,
  ArrowLeft,
  Shield,
  Briefcase,
  Lock,
  Plug,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { isSuperAdmin } from '@/lib/roles';
import { isProRouteLocked } from '@/lib/access/pro-features';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { fetchModerationQueue } from '@/lib/queries/reviews-moderation';
import { propertyModerationCountQueryOptions } from '@/lib/queries/agency-queues';

/**
 * TCK-371 (revue adverse) — l'anneau de focus de la barre `/admin`.
 *
 * ## Pourquoi PAS le jeton `--ring` ici : c'est la GÉOMÉTRIE, pas la couleur
 *
 * `outline-2` + `-outline-offset-2` remplit exactement la bande de 2 px la plus EXTÉRIEURE de
 * l'élément. Son bord externe jouxte le fond de la barre — mais son bord INTERNE jouxte le fond
 * PROPRE de l'entrée, et c'est celui-là qui avait été oublié. Les trois fonds réels de la barre,
 * mesurés (WCAG 2.1, alpha composé AVANT le calcul) :
 *
 *   fond de l'entrée                            `outline-ring` #a85332   `outline-white`
 *   barre nue        `bg-foreground` #1f1812             3,30:1              17,53:1
 *   entrée ACTIVE    `bg-white/10`   #352f2a             2,48:1  ✗ ÉCHEC     13,17:1
 *   entrée SURVOLÉE  `bg-white/5`    #2a241e             2,89:1  ✗ ÉCHEC     15,39:1
 *
 * Deux des trois tombaient sous les 3:1 de WCAG 1.4.11 — dont celui de l'entrée ACTIVE, et il y
 * en a exactement UNE sur CHAQUE page `/admin`. Le cas survolé n'est pas théorique : c'est la
 * souris qui repose sur la liste pendant que le clavier y navigue.
 *
 * `white` tient sur les trois, et tient ENCORE (5,32:1) si le fond de l'entrée active devenait
 * `--primary` un jour — l'ablation qui rendait l'anneau `--ring` identique à son propre fond,
 * 1,00:1, invisible, sans un seul test rouge. C'est un anneau qui ne dépend d'aucune hypothèse
 * sur ce qu'il recouvre, et c'est le vocabulaire que la barre parle déjà (`text-white`,
 * `bg-white/10`). ⚠ `outline-ring/50`, l'idiome de `ui/button.tsx`, mesure 1,73:1 ici : il ne se
 * recopie pas sur ce fond-là.
 *
 * `outline-2` rend `outline-style: solid`, ce qui écrase l'`outline: auto` du navigateur :
 * sans cela Chrome et Safari ignorent `outline-color` et la couleur mesurée ne s'applique pas.
 *
 * ## Deux décalages, et le critère du choix est : « le conteneur coupe-t-il ? »
 *
 * Le `<nav>` est en `overflow-y-auto`, et dès qu'un axe n'est pas `visible` l'autre calcule
 * `auto` (CSS Overflow 3 §3) : un anneau SORTANT y serait rogné. Les items de nav prennent donc
 * le décalage NÉGATIF.
 *
 * ⚠ Cette justification ne vaut QUE pour eux — elle était appliquée à tort aux trois autres
 * liens. Le logo vit dans un `<div className="px-6 py-5">` et les deux liens de pied dans un
 * `<div className="space-y-2 px-3 pb-4">` : aucun conteneur qui coupe. Pire, sur le logo — lien
 * EN LIGNE sans padding vertical — un anneau rentrant est tracé de 2 à 4 px À L'INTÉRIEUR d'une
 * boîte dont la demi-marge vaut 4 px : il affleure les glyphes au lieu de les entourer. Ces
 * trois-là prennent le décalage SORTANT.
 *
 * Les chiffres ci-dessus sont REJOUÉS par `__tests__/AdminSidebar.a11y.test.tsx`, qui les
 * recalcule sur le fond réel remonté du DOM — pas sur une chaîne de classes.
 */
const ANNEAU_FOCUS =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white';

/** Le même anneau, décalé vers l'EXTÉRIEUR — pour les liens qu'aucun conteneur ne rogne. */
const ANNEAU_FOCUS_SORTANT =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

interface NavItem {
  href: string;
  /** CLÉ de libellé sous `nav.admin`, pas le libellé : `buildAdminItems` est hors composant. */
  labelKey: string;
  icon: LucideIcon;
  badge?: number;
  locked?: boolean;
}

interface AdminSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
  /** `true` when the active agency is on `kind=standard`. Items in
   *  `PRO_ROUTES` are padlocked when this is `false` (individual) for
   *  agency_admins; super_admin is never padlocked. */
  agencyIsStandard?: boolean;
}

function buildAdminItems(
  user: User,
  reviewPendingCount: number,
  propertyPendingCount: number,
): NavItem[] {
  const items: NavItem[] = [{ href: '/admin', labelKey: 'dashboard', icon: LayoutDashboard }];
  if (isSuperAdmin(user.roles)) {
    items.push({ href: '/admin/properties', labelKey: 'properties', icon: Building2 });
  }
  items.push({ href: '/admin/team', labelKey: 'team', icon: Users });
  // TCK-279 — juste sous « Équipe » : c'est depuis la console Équipe qu'on
  // attribue un rôle, et depuis celle-ci qu'on le définit.
  items.push({ href: '/admin/roles', labelKey: 'roles', icon: KeyRound });
  items.push({ href: '/admin/agency', labelKey: 'agency', icon: Briefcase });
  items.push({ href: '/admin/agency/kyc', labelKey: 'kyc', icon: ShieldCheck });
  items.push({ href: '/admin/agency/billing', labelKey: 'billing', icon: CreditCard });
  items.push({ href: '/admin/finances', labelKey: 'finances', icon: CreditCard });
  if (isSuperAdmin(user.roles)) {
    items.push({
      href: '/admin/moderation',
      labelKey: 'reviewModeration',
      icon: Shield,
      badge: reviewPendingCount || undefined,
    });
  }
  // TCK-098 — property moderation is accessible to agency_admin + super_admin.
  items.push({
    href: '/admin/moderation/properties',
    labelKey: 'propertyModeration',
    icon: Building2,
    badge: propertyPendingCount || undefined,
  });
  items.push({ href: '/admin/audit', labelKey: 'auditLog', icon: FileText });
  // TCK-370 — les intégrations suivent ce que l'API autorise, pas ce que le menu supposait.
  // `routes/api/integrations.php` ne pose qu'`auth:sanctum`, et `IntegrationController::index`
  // laisse entrer un `agency_admin` sur SON agence (`isAgencyAdminAt`). L'entrée n'existait
  // nulle part : `/admin/settings/integrations` n'était atteignable que par l'onglet de
  // `/admin/settings`, page réservée au super-admin — donc par aucun chemin pour un
  // `agency_admin`. Elle est poussée à tout admin ; le layout `(dashboard)/admin` a déjà
  // écarté les autres rôles.
  items.push({
    href: '/admin/settings/integrations',
    labelKey: 'integrations',
    icon: Plug,
  });
  // `/api/admin/settings` is super-admin-only at the route middleware level
  // (`routes/api/admin.php` group), so showing this entry to agency_admin
  // only leads to a broken page. Restrict to super_admin.
  if (isSuperAdmin(user.roles)) {
    items.push({ href: '/admin/settings', labelKey: 'settings', icon: Settings });
  }
  return items;
}

function AdminItem({
  href,
  labelKey,
  icon: Icon,
  badge,
  locked,
  active,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  const t = useTranslations('nav.admin');
  const label = t(labelKey);

  if (locked) {
    return (
      <span
        role="link"
        aria-disabled="true"
        // TCK-371, revue adverse — l'entrée verrouillée est ATTEIGNABLE AU CLAVIER, et sa raison
        // est LISIBLE par un lecteur d'écran.
        //
        // Elle était `aria-disabled` sans `tabIndex` : donc hors de l'ordre de tabulation, et le
        // `title` — SEUL endroit où la raison du cadenas était écrite — n'est servi qu'à la
        // souris. L'objectif du ticket (« l'admin LIT ce qu'un passage en standard lui
        // débloquerait ») n'était atteint qu'au pointeur. `tabIndex={0}` sur un élément
        // `aria-disabled` est le motif « désactivé mais découvrable » : il reste inopérant — pas
        // de `href`, pas de `onClick` — mais il s'annonce, et le `sr-only` ci-dessous entre dans
        // son nom accessible. Le `title` reste pour l'infobulle du pointeur.
        tabIndex={0}
        title={t('proLocked')}
        // TCK-371 — `text-white/40` ET `opacity-60` composaient un alpha effectif de 0,24 :
        // encre #554f4b sur le fond de la barre (`bg-foreground` = #1f1812), soit **2,18:1**,
        // très en dessous des 4,5:1 exigés. L'opacité portait l'interdit une troisième fois,
        // après le cadenas et le curseur. Un seul alpha, plus haut : #9a9794 sur #1f1812 =
        // **6,04:1**, et l'entrée reste plus sourde que l'item inactif (`text-white/70`,
        // 9,04:1) qu'elle doit continuer de se distinguer.
        className={cn(
          'flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-white/55',
          ANNEAU_FOCUS,
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate flex-1">{label}</span>
        <span className="sr-only">{t('proLocked')}</span>
        <Lock className="ml-auto size-3.5 shrink-0" aria-hidden />
      </span>
    );
  }
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        ANNEAU_FOCUS,
        active
          ? 'bg-white/10 font-semibold text-white'
          : 'text-white/70 hover:bg-white/5',
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate flex-1">{label}</span>
      {badge ? (
        <span
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500/80 px-1.5 text-[10px] font-bold text-white"
          aria-label={t('pendingBadge', { count: badge })}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AdminSidebar({ user, className, onNavigate, agencyIsStandard }: AdminSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav.admin');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const { token } = useAuth();

  const { data: modMeta } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () =>
      fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    enabled: Boolean(token) && isSuperAdmin(user.roles),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // TCK-098 — compte de modération des biens (accessible aussi à `agency_admin`).
  //
  // TCK-375 — la définition de cette requête a DÉMÉNAGÉ dans `@/lib/queries/agency-queues` sans
  // changer de clé. Le bloc de files de `/admin` lit le même nombre : deux `queryKey` pour un
  // seul compteur, ce seraient deux requêtes réseau et, après une décision de modération, un
  // badge rafraîchi devant une tuile périmée. La clé de cache est le point de rendez-vous.
  const { data: propModCount } = useQuery(
    propertyModerationCountQueryOptions(token ?? null, agencyIsStandard),
  );

  const items = buildAdminItems(user, modMeta?.pending_count ?? 0, propModCount ?? 0)
    .map((item) => ({
      ...item,
      locked: isProRouteLocked(user, agencyIsStandard, item.href),
    }));
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();

  return (
    <aside className={cn('flex h-full w-64 flex-col bg-foreground text-white', className)}>
      <div className="px-6 py-5">
        <Link
          href="/"
          onClick={onNavigate}
          className={`text-xl font-bold tracking-tighter text-white rounded-sm ${ANNEAU_FOCUS_SORTANT}`}
        >
          {tCommon('appName')}
        </Link>
        <p className="mt-1 text-xs uppercase tracking-wider text-white/60">{t('sectionLabel')}</p>
      </div>
      <nav className="flex-1 overflow-y-auto space-y-1 px-3">
        {items.map((item) => {
          // Exact match for the dashboard root, prefix match for nested routes.
          // TCK-370 — `/admin/settings` rejoint la liste des correspondances EXACTES : depuis
          // qu'« Intégrations » est une entrée à part entière, un préfixe allumerait les deux
          // lignes à la fois sur `/admin/settings/integrations`.
          const active =
            item.href === '/admin'
            || item.href === '/admin/agency'
            || item.href === '/admin/settings'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <AdminItem
              key={item.href}
              {...item}
              active={active}
              onNavigate={onNavigate}
            />
          );
        })}
      </nav>
      <div className="space-y-2 px-3 pb-4">
        <Link
          href="/app"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/5 ${ANNEAU_FOCUS_SORTANT}`}
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span>{t('backToPersonal')}</span>
        </Link>
        <Link
          href="/app/profile"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/5 ${ANNEAU_FOCUS_SORTANT}`}
        >
          <Avatar className="size-9">
            {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={user.full_name} /> : null}
            <AvatarFallback className="bg-white/10 text-white">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user.full_name}</p>
            <p className="truncate text-xs text-white/60">{tNav('myProfile')}</p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
