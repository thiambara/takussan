'use client';

import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { entreesDeMenu, type AccesAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import { ProUpgradeCard, type ApparenceProUpgradeCard } from './ProUpgradeCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { initialesDe, libelleDe } from '@/lib/identite';
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

/**
 * TCK-633 — la carte « Passer en agence » (décision 1 du porteur), habillée pour CETTE barre.
 *
 * Le vocabulaire de la barre : fonds `white/5` puis `white/10` au survol — ceux d'une entrée — et
 * l'anneau blanc SORTANT des liens hors du `<nav>` (rien ne le rogne). Mesuré par
 * `AdminSidebar.a11y.test.tsx` : l'habillage clair de `/app` (`bg-muted`, anneau `--ring`) donnait
 * ici un anneau à 1,2:1 sur le fond propre de la carte. L'appel est en blanc : `text-primary`
 * (#a85332) mesure environ 3,3:1 sur cette barre, sous l'AA d'un texte de 11 px.
 */
const CARTE_DE_PASSAGE: ApparenceProUpgradeCard = {
  carte: `border-white/15 bg-white/5 hover:bg-white/10 ${ANNEAU_FOCUS_SORTANT}`,
  pastille: 'bg-white/10 text-white',
  titre: 'text-white',
  corps: 'text-white/70',
  appel: 'text-white',
};
import { ADMIN_EXACT_ROOTS, resolveActiveHref } from '@/lib/navigation/active-path';

interface NavItem {
  href: string;
  /** CLÉ de libellé sous `nav.admin`, pas le libellé : `PAGES_ADMIN` est hors composant. */
  labelKey: string;
  icon: LucideIcon;
  badge?: number;
}

interface AdminSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
  /** `true` quand l'agence active est `standard`. Sert au sondage du compteur de modération des
   *  biens et au REPLI quand aucun `AccesAdminProvider` n'est monté. */
  agencyIsStandard?: boolean;
  /** Une demande de passage en agence attend la décision de la plateforme (TCK-267) : la carte
   *  « Passer en agence » le dit au lieu de la proposer à nouveau. */
  hasPendingUpgrade?: boolean;
}

/**
 * TCK-633 (lot B, AC1) — le menu ne liste QUE les pages que le profil actif peut ouvrir.
 *
 * L'ordre, les libellés et les icônes vivent dans `PAGES_ADMIN` (`@/lib/access/pages-admin`), la
 * table que la garde de chaque page lit aussi : une entrée ne peut plus mener à une page qui renvoie
 * ailleurs. Les entrées verrouillées de TCK-371 disparaissent avec elle — le ticket veut que l'on
 * « ne voie que ce qu'on peut ouvrir », et l'incitation à passer en agence est portée par UNE carte
 * (`ProUpgradeCard`, décision 1 du porteur). Les motifs de chaque ligne (TCK-279, TCK-370,
 * TCK-597…) sont écrits dans la table.
 */
function itemsDuMenu(
  acces: AccesAdmin,
  reviewPendingCount: number,
  propertyPendingCount: number,
): NavItem[] {
  const badges: Record<string, number> = {
    '/admin/moderation': reviewPendingCount,
    '/admin/moderation/properties': propertyPendingCount,
  };
  return entreesDeMenu(acces).map((entree) => ({
    href: entree.chemin,
    labelKey: entree.cle,
    icon: entree.icone,
    badge: badges[entree.chemin] || undefined,
  }));
}

function AdminItem({
  href,
  labelKey,
  icon: Icon,
  badge,
  active,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  const t = useTranslations('nav.admin');
  const label = t(labelKey);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors max-md:py-2.5',
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
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white"
          aria-label={t('pendingBadge', { count: badge })}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AdminSidebar({
  user,
  className,
  onNavigate,
  agencyIsStandard,
  hasPendingUpgrade,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('nav.admin');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const { token } = useAuth();
  const acces = useAccesAdminOuRepli({
    roles: user.roles,
    agencyId: user.agency_id,
    agencyIsStandard,
  });
  // TCK-633 — « Mon espace » chez un admin d'agence `individual`, comme partout ailleurs.
  const titre = acces.espaceIndividuel ? t('mySpace') : t('sectionLabel');

  const { data: modMeta } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () =>
      fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    // TCK-633 — on ne sonde pas la file d'une page que le profil ne peut pas ouvrir.
    enabled: Boolean(token) && acces.chemins.includes('/admin/moderation'),
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

  const items = itemsDuMenu(acces, modMeta?.pending_count ?? 0, propModCount ?? 0);
  // TCK-377 — la règle « racine par égalité, sous-route par préfixe » vit désormais dans
  // `@/lib/navigation/active-path`, partagée par les trois shells. Le passage à
  // `resolveActiveHref` (le plus long préfixe, et lui seul) corrige au passage un double
  // surlignage mesuré : sur `/admin/moderation/properties`, « Modération avis » ET « Modération
  // biens » s'allumaient ensemble pour un super-admin, les deux `href` étant des préfixes valides.
  const activeHref = resolveActiveHref(
    pathname,
    items.map((item) => item.href),
    ADMIN_EXACT_ROOTS,
  );
  // TCK-623 — un compte sans nom : une silhouette, et ce qui désigne le compte.
  const initials = initialesDe(user);
  const libelle = libelleDe(user) ?? tNav('accountFallback');

  return (
    <aside className={cn('flex h-full w-64 flex-col bg-foreground text-white', className)}>
      <div className="px-5 py-5">
        {/* `px-1` : l'anneau posé à l'ouverture du tiroir ne rase plus les glyphes.
            TCK-621 — le logo, dans le tiroir seulement : à partir de `md`, la barre haute le porte
            déjà, 60 px au-dessus (même règle qu'`AppSidebar`). */}
        <Link
          href="/"
          onClick={onNavigate}
          className={`inline-flex rounded-sm px-1 py-1 md:hidden ${ANNEAU_FOCUS_SORTANT}`}
        >
          <Logo nom={tCommon('appName')} ton="clair" />
        </Link>
        <p className="mt-1 px-1 md:mt-0 text-xs uppercase tracking-wider text-white/60">{titre}</p>
      </div>
      <nav aria-label={titre} className="flex-1 overflow-y-auto space-y-1 px-3">
        {items.map((item) => (
          <AdminItem
            key={item.href}
            {...item}
            active={item.href === activeHref}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      <div className="space-y-2 px-3 pb-4">
        {/* TCK-633 — décision 1 du porteur : les cadenas de TCK-371 ne disent plus, entrée par
            entrée, ce qu'un passage en agence débloquerait ; UNE carte le propose, dans « Mon
            espace » et seulement là. Hors du `<nav>` : c'est une proposition, pas une page. */}
        {acces.espaceIndividuel ? (
          <ProUpgradeCard
            pending={Boolean(hasPendingUpgrade)}
            onNavigate={onNavigate}
            apparence={CARTE_DE_PASSAGE}
          />
        ) : null}
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
            {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={libelle} /> : null}
            <AvatarFallback className="bg-white/10 text-white">
              {initials ?? <UserRound className="size-4" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{libelle}</p>
            <p className="truncate text-xs text-white/60">{tNav('myProfile')}</p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
