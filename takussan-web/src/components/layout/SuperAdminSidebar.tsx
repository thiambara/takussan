'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  FlaskConical,
  Home,
  LayoutDashboard,
  ListTree,
  Megaphone,
  PlugZap,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Tags,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  queueCountQueryOptions,
  type SuperAdminQueueKey,
} from '@/lib/queries/super-admin-queues';

interface NavItem {
  href: string;
  /** CLÉ sous `nav.superAdmin.items`, pas le libellé : `NAV_GROUPS` est une constante de module. */
  labelKey: string;
  icon: LucideIcon;
  children?: NavItem[];
  /**
   * When set, the sidebar fetches the matching badge value via react-query.
   *
   * TCK-268 a écrit ce mécanisme générique et l'a laissé avec UN seul cas — le badge d'upgrade
   * était donc la seule entrée du menu à porter un compte, alors que trois autres files
   * existaient. TCK-360 le branche sur les quatre : les clés, leurs `queryFn` et leur cadence
   * vivent dans `@/lib/queries/super-admin-queues`, partagées avec la section « files » de
   * l'accueil pour que les deux affichent LE MÊME nombre, du même cache.
   */
  badgeKey?: SuperAdminQueueKey;
}

interface NavGroup {
  /** CLÉ sous `nav.superAdmin.groups`. */
  labelKey: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'overview',
    items: [
      { href: '/super-admin', labelKey: 'console', icon: LayoutDashboard },
      { href: '/super-admin/reports', labelKey: 'reports', icon: BarChart3 },
    ],
  },
  {
    labelKey: 'operations',
    items: [
      { href: '/super-admin/agencies', labelKey: 'agencies', icon: Building2 },
      {
        href: '/super-admin/agency-upgrade-requests',
        labelKey: 'upgradeRequests',
        icon: ClipboardCheck,
        badgeKey: 'upgrade-requests-pending',
      },
      { href: '/super-admin/users', labelKey: 'users', icon: Users },
      { href: '/super-admin/super-admins', labelKey: 'superAdmins', icon: ShieldCheck },
      { href: '/super-admin/properties', labelKey: 'properties', icon: Home },
      { href: '/super-admin/kyc', labelKey: 'kyc', icon: ShieldCheck, badgeKey: 'kyc-pending' },
      {
        href: '/super-admin/moderation',
        labelKey: 'moderation',
        icon: ShieldAlert,
        badgeKey: 'moderation-pending',
      },
    ],
  },
  {
    labelKey: 'revenue',
    items: [
      { href: '/super-admin/plans', labelKey: 'plans', icon: CreditCard },
      { href: '/super-admin/payouts', labelKey: 'payouts', icon: Send },
    ],
  },
  {
    labelKey: 'content',
    items: [
      { href: '/super-admin/tags', labelKey: 'tags', icon: Tags },
      { href: '/super-admin/enums', labelKey: 'enums', icon: ListTree },
      { href: '/super-admin/templates', labelKey: 'templates', icon: Bell },
      { href: '/super-admin/announcements', labelKey: 'announcements', icon: Megaphone },
    ],
  },
  {
    labelKey: 'platform',
    items: [
      { href: '/super-admin/settings', labelKey: 'settings', icon: SlidersHorizontal },
      { href: '/super-admin/integrations', labelKey: 'integrations', icon: PlugZap },
      { href: '/super-admin/feature-flags', labelKey: 'featureFlags', icon: FlaskConical },
      { href: '/super-admin/alerts', labelKey: 'alerts', icon: Siren },
      { href: '/super-admin/audit', labelKey: 'audit', icon: Activity },
      {
        href: '/super-admin/system',
        labelKey: 'system',
        icon: Settings2,
        children: [
          { href: '/super-admin/system/health', labelKey: 'health', icon: Activity },
          { href: '/super-admin/system/maintenance', labelKey: 'maintenance', icon: Wrench },
          { href: '/super-admin/system/scheduler', labelKey: 'scheduler', icon: CalendarClock },
        ],
      },
    ],
  },
];

interface SuperAdminSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

/**
 * Distinct sidebar for the super-admin area (TCK-145) : surface sombre + accent ocre, pour que
 * le contexte cross-tenant ne se confonde jamais avec le `(dashboard)` agence.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-358 — la surface reste sombre, la palette Tailwind brute disparaît
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Cette barre portait 16 utilitaires `stone-*` / `amber-*` en dur. Les remplacer par des jetons
 * clairs aurait éteint la distinction ; en inventer un jeu parallèle (`--console-sidebar-*`)
 * aurait rouvert exactement le doublon de vocabulaire que `scripts/check-app-tokens.mjs` a
 * fermé sur `--app-*`.
 *
 * La barre porte donc la classe `dark` : `globals.css` y redéfinit déjà `--sidebar`,
 * `--sidebar-foreground`, `--sidebar-primary` et leurs voisins sur la rampe sombre. Un seul
 * vocabulaire, une seule source de valeurs, et un effet de bord qui était un défaut avant :
 * toute primitive shadcn montée ici hérite maintenant du thème sombre au lieu de rendre en
 * clair sur fond sombre. `SuperAdminTopbar` et le `SheetContent` mobile de `SuperAdminShell`
 * suivent le même mécanisme.
 *
 * ⚠ La classe `dark` n'est PAS le mode sombre de l'utilisateur : c'est une surface
 * délibérément sombre en permanence. Basculer le thème global ne la change pas — c'est voulu.
 *
 * ⚠ L'entrée ACTIVE est une pastille pleine (`bg-sidebar-primary`), pas un fond teinté. La
 * traduction littérale de l'ancien fond ambre 500 à 15 % + encre ambre 200 aurait donné du
 * terracotta sur
 * du terracotta à 20 % : **3,59:1**, sous le plancher AA de 4,5:1 pour du texte normal. Le plein
 * mesure 5,31:1 (encre `--sidebar-primary-foreground` sur `--sidebar-primary`).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-359 — LES MESURES DE CETTE BARRE VIVENT ICI, ET NULLE PART AILLEURS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce fichier a porté DEUX nombres contradictoires pour la MÊME paire — 8,08:1 dans ce docblock,
 * 7,91:1 dans le commentaire du libellé de groupe, tous deux écrits le même jour. Le second était
 * faux, et il n'était pas décoratif : il ancrait une consigne opérationnelle (« ne pas redescendre
 * sous 70 % »), donc il faisait croire à 0,17 de marge en moins qu'il n'y en a. *Deux endroits qui
 * portent le même chiffre finissent par en porter deux différents* — le chiffre est donc écrit une
 * seule fois, ici, et les commentaires de rendu renvoient à ce bloc sans le recopier.
 *
 * Recalculé le 2026-08-27 (WCAG 2.x, composition alpha en sRGB avant le calcul), contexte `dark` :
 *
 *   libellé de groupe   `--sidebar-foreground` @70 % / `--sidebar`  ....  8,0781:1
 *   item inactif        `--sidebar-foreground` @85 % / `--sidebar`  ....  11,27:1
 *   sous-item & retour  `--sidebar-foreground` @80 % / `--sidebar`  ....  10,13:1
 *   survol              `--sidebar-accent-foreground` / `--sidebar-accent`   12,53:1
 *   item actif & badge  `--sidebar-primary-foreground` / `--sidebar-primary`  5,31:1
 *   sous-item actif     idem sur `--sidebar-primary`@90 % aplati sur `--sidebar`  4,60:1
 *   eyebrow             `--sidebar-primary` / `--sidebar`  ...............  4,83:1
 *   titre               `--sidebar-foreground` / `--sidebar`  ............  15,16:1
 *
 * Le relevé complet du shell (topbar, onglets, tables, anneaux) est dans les notes
 * d'implémentation de TCK-359.
 */
export function SuperAdminSidebar({ className, onNavigate }: SuperAdminSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav.superAdmin');
  const tGroups = useTranslations('nav.superAdmin.groups');

  return (
    <aside
      className={cn(
        'dark flex h-full w-64 shrink-0 flex-col overflow-hidden bg-sidebar text-sm text-sidebar-foreground',
        className,
      )}
    >
      <div className="shrink-0 px-5 pb-4 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sidebar-primary">{t('eyebrow')}</p>
        <p className="mt-1 text-base font-semibold text-sidebar-foreground">{t('title')}</p>
      </div>
      <nav
        aria-label={t('ariaNav')}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-5 pt-1 [scrollbar-gutter:stable] [scrollbar-width:thin]"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className="space-y-1">
            {/*
              TCK-359 — le libellé de groupe doit tenir 4,5:1 sur le fond de la barre ; `stone-500`
              (3,65:1) échouait. L'opacité de 70 % n'est pas un réglage d'œil : elle est mesurée,
              et le chiffre est dans le docblock du composant — un seul endroit, délibérément.
              Ne pas la redescendre sans y refaire la mesure.
            */}
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
              {tGroups(group.labelKey)}
            </p>
            {group.items.map((item) => (
              <SuperAdminNavItem
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
        <Link
          href="/app"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{t('backToPersonal')}</span>
        </Link>
      </div>
    </aside>
  );
}

function SuperAdminNavItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string | null;
  onNavigate?: () => void;
}) {
  const active = isActivePath(pathname, item.href);
  const current = pathname === item.href;
  const Icon = item.icon;
  const badge = useNavBadge(item.badgeKey);
  const t = useTranslations('nav.superAdmin');
  const tItems = useTranslations('nav.superAdmin.items');

  return (
    <div className="space-y-1">
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
          // TCK-359 — anneau de focus explicite : sur une surface sombre le contour par défaut
          // du navigateur est quasi invisible. `ring-ring` = jeton `--ring`, jamais un hex.
          //
          // ⚠ `ring-offset-2 ring-offset-sidebar` n'est PAS cosmétique. En contexte `dark`,
          // `--ring` et `--sidebar-primary` sont le même octet (#c87a52) : sans liseré, focaliser
          // l'entrée ACTIVE — celle que l'utilisateur clavier atteint en premier, `aria-current` —
          // peint un anneau de la couleur EXACTE de la pastille, soit 1,00:1. Le liseré de 2 px en
          // `--sidebar` rétablit 4,83:1 des deux côtés (liseré/pastille et anneau/liseré). Sur les
          // entrées non actives il est invisible par construction : sa couleur est celle du fond.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
          active
            ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground'
            : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{tItems(item.labelKey)}</span>
        {badge && badge > 0 ? (
          <span
            aria-label={t('pendingBadge', { count: badge })}
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold text-sidebar-primary-foreground"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </Link>
      {item.children?.length ? (
        <div className="ml-5 space-y-1 border-l border-sidebar-border pl-2">
          {item.children.map((child) => {
            const childActive = isActivePath(pathname, child.href);
            const ChildIcon = child.icon;

            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                aria-current={childActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                  // Même raison que l'entrée parente : la pastille active porte `--sidebar-primary`,
                  // qui EST `--ring` en contexte `dark`. Cf. le commentaire ci-dessus.
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                  childActive
                    ? 'bg-sidebar-primary/90 font-semibold text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <ChildIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{tItems(child.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/super-admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * TCK-268 / TCK-360 — Live badge counts for sidebar entries that surface a backlog.
 *
 * La cadence reste généreuse (60 s) pour que la barre latérale ne devienne pas un cron serré ;
 * les écrans de décision invalident la même clé de cache et rafraîchissent donc le badge
 * immédiatement, sans attendre le prochain tour.
 *
 * ⚠ Un seul `useQuery` ici, pas un par file : ce hook est appelé pour CHAQUE entrée de menu, et
 * les règles des hooks interdisent d'en appeler un nombre variable. C'est `enabled` qui décide.
 */
function useNavBadge(badgeKey?: SuperAdminQueueKey): number | null {
  const fallback: SuperAdminQueueKey = 'upgrade-requests-pending';
  const options = queueCountQueryOptions(badgeKey ?? fallback);

  const { data } = useQuery({
    ...options,
    queryKey: badgeKey ? options.queryKey : ['super-admin', 'nav-badge', 'disabled'],
    enabled: Boolean(badgeKey),
  });

  return badgeKey ? (data ?? null) : null;
}
