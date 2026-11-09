'use client';

import { Suspense, type ComponentType, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { CircleUserRound, Compass, Heart, MessageSquare, Plus, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { AnnonceDesNonLus } from '@/components/layout/AnnonceDesNonLus';
import { useCompteursDuMenu } from '@/components/layout/useCompteursDuMenu';
import { useLibelleDuCompteur } from './useLibelleDuCompteur';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { decouperLocale } from '@/i18n/routing';
import { initialesDe } from '@/lib/identite';
import { HREF_COMPTE, hrefDuCompte, libellePublic, porteLaBarrePublique, REQUETE_BARRE_PUBLIQUE } from '@/lib/navigation/barre-publique';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { useEspacePublic } from './useEspacePublic';
import type { EntreeRendue } from '@/components/layout/useMenuDeLEspace';

/**
 * Une case : un cinquième de la largeur (72 px à 360), toute la hauteur de la barre (60 px) — cibles
 * ≥ 44 px. Icône et libellé toujours visibles (ADR-0091 §1).
 */
const STYLE_CASE =
  'relative flex h-full w-full flex-col items-center justify-center gap-0.5 px-0.5 text-[11px] leading-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

interface CaseDeBarre {
  readonly id: string;
  readonly href: string;
  readonly libelle: string;
  readonly icone?: ComponentType<{ className?: string }>;
  /** La case « Moi » : les initiales du compte à la place d'un pictogramme. */
  readonly avatar?: ReactNode;
  readonly compte?: number;
  readonly libelleCompteur?: string;
}

/**
 * TCK-2493 (ADR-0091) — la barre d'onglets du SITE PUBLIC, sous `lg` : cinq cases égales, fixées en bas.
 *
 * - Anonyme : Explorer · Favoris · Publier · Messages · Compte (décision 2a).
 * - Connecté : Explorer · les deux cases du persona (`casesDuPersona`, dérivées de `DISPOSITIONS`) ·
 *   Messages · Moi. Mêmes compteurs que le menu de `/app` (`useCompteursDuMenu`), sondés sous `lg`
 *   seulement. Changer d'espace change la barre sans recharger : le persona suit `activeProfileId`.
 * - Absente là où une autre couche d'action tient le bas de l'écran (`porteLaBarrePublique`) : fiche,
 *   tunnels, pages par lien ; la carte plein écran la masque par CSS.
 *
 * `data-barre-onglets-publique` : `globals.css` en tire la réserve de `body` (rien de la page sous la
 * barre, TCK-503) et l'assise du dock flottant (la pastille du comparateur se pose au-dessus).
 *
 * `presente` (TCK-2568) — la surcharge d'une PAGE dont le bas ne dépend pas que du chemin : le bien
 * retiré vit sous `/properties/<slug>`, chemin d'une fiche (sa barre d'actions tient le bas), mais
 * n'a pas de barre d'actions — la maquette (Erreurs A, « Bien retiré ») lui donne la barre d'onglets.
 * La page la monte elle-même ; celle du layout, qui suit le chemin, reste absente : une seule barre.
 */
export function BarreDOngletsPublique({ presente = false }: { readonly presente?: boolean } = {}) {
  const pathname = usePathname();
  const { user } = useAuth();
  if (!presente && !porteLaBarrePublique(pathname)) return null;
  if (user) return <BarreConnectee user={user} pathname={pathname} />;
  // La requête n'entre que dans le lien « Compte » : `useSearchParams` sous sa propre frontière, la
  // barre entière est rendue au serveur (sans la requête) même sur une page statique.
  return (
    <Suspense fallback={<BarreAnonyme pathname={pathname} requete="" />}>
      <BarreAnonymeAvecRequete pathname={pathname} />
    </Suspense>
  );
}

function BarreAnonymeAvecRequete({ pathname }: { readonly pathname: string | null }) {
  return <BarreAnonyme pathname={pathname} requete={useSearchParams()?.toString() ?? ''} />;
}

/** La case active : « Compte » / « Moi » sur leur écran, Favoris sur la page des favoris, sinon Explorer. */
function caseActive(pathname: string | null): string {
  const { chemin } = decouperLocale(pathname ?? '/');
  if (chemin === HREF_COMPTE) return 'compte';
  if (chemin === '/favorites') return 'favoris';
  return 'explorer';
}

function BarreAnonyme({ pathname, requete }: { readonly pathname: string | null; readonly requete: string }) {
  const t = useTranslations('navigationPublique.onglets');
  const cases: CaseDeBarre[] = [
    { id: 'explorer', href: '/', libelle: t('explorer'), icone: Compass },
    { id: 'favoris', href: '/favorites', libelle: t('favoris'), icone: Heart },
    { id: 'publier', href: '/publish', libelle: t('publier'), icone: Plus },
    // Messages demande une session : `/app/messages` passe par la connexion (`proxy.ts`), et revient.
    { id: 'messages', href: '/app/messages', libelle: t('messages'), icone: MessageSquare },
    // TCK-568 — « Se connecter » ramènera à la page quittée, filtres compris.
    { id: 'compte', href: hrefDuCompte(requete ? `${pathname}?${requete}` : pathname), libelle: t('compte'), icone: CircleUserRound },
  ];
  return <Barre cases={cases} actif={caseActive(pathname)} />;
}

function BarreConnectee({ user, pathname }: { readonly user: User; readonly pathname: string | null }) {
  const t = useTranslations('navigationPublique.onglets');
  const tNav = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const sousLg = useMatchesMedia(REQUETE_BARRE_PUBLIQUE);
  const espace = useEspacePublic(user);
  const messagerie = espace.entrees.find((e) => e.id === 'messagerie') ?? null;
  const comptees = messagerie ? [...espace.cases, messagerie] : espace.cases;
  const compteurs = useCompteursDuMenu(comptees, { agencyIsStandard: espace.agencyIsStandard, actif: sousLg });
  const libelleCompteur = useLibelleDuCompteur();
  const libelleDe = (e: EntreeRendue) => {
    // Un libellé propre au site public (« Loyer »), sinon celui de l'entrée de menu (`nav.sidebar`,
    // déjà abrégé par `ongletsDuMenu`).
    const court = libellePublic(e.id, espace.persona);
    if (court) return t(court);
    return e.labelSpace === 'nav.admin' ? tAdmin(e.labelKey) : tNav(e.labelKey);
  };
  const compter = (e: EntreeRendue) => {
    const compte = e.counterKey ? compteurs[e.counterKey] : 0;
    return e.counterKey && compte > 0 ? { compte, libelleCompteur: libelleCompteur(e.counterKey, compte) } : {};
  };
  const initiales = initialesDe(user);
  const cases: CaseDeBarre[] = [
    { id: 'explorer', href: '/', libelle: t('explorer'), icone: Compass },
    ...espace.cases.map((e) => ({ id: e.id, href: e.href, libelle: libelleDe(e), icone: e.icon, ...compter(e) })),
    {
      id: 'messages',
      href: '/app/messages',
      libelle: t('messages'),
      icone: MessageSquare,
      ...(messagerie ? compter(messagerie) : {}),
    },
    {
      id: 'compte',
      href: HREF_COMPTE,
      libelle: t('moi'),
      avatar: initiales ?? <UserRound className="size-3.5" aria-hidden />,
    },
  ];
  return (
    <Barre cases={cases} actif={caseActive(pathname)}>
      {/* La pastille est muette (`aria-hidden`) : la région live annonce les nouveaux non-lus (WCAG 4.1.3). */}
      <AnnonceDesNonLus compte={compteurs.unreadMessages} actif={sousLg} />
    </Barre>
  );
}

function Barre({
  cases,
  actif,
  children,
}: {
  readonly cases: readonly CaseDeBarre[];
  readonly actif: string;
  readonly children?: ReactNode;
}) {
  const t = useTranslations('navigationPublique');
  const tNav = useTranslations('nav.sidebar.onglets');
  return (
    <nav
      aria-label={t('barre.navLabel')}
      data-barre-onglets-publique=""
      className="fixed inset-x-0 bottom-0 z-40 h-[var(--barre-publique-hauteur)] border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex h-full">
        {cases.map((c) => {
          const estActive = c.id === actif;
          const Icone = c.icone;
          return (
            <li key={c.id} className="min-w-0 flex-1 basis-0">
              <LienLocalise
                href={c.href}
                aria-current={estActive ? 'page' : undefined}
                // Le nom accessible CONTIENT le libellé visible (WCAG 2.5.3), puis le compte exact.
                aria-label={
                  c.compte && c.libelleCompteur
                    ? tNav('nomAvecCompteur', { libelle: c.libelle, compteur: c.libelleCompteur })
                    : undefined
                }
                data-case={c.id}
                className={cn(
                  STYLE_CASE,
                  estActive ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
                )}
              >
                {/* La case active se lit par une FORME (ce trait), un poids et `aria-current` — jamais
                    par la seule teinte (ADR-0091, comme la barre de `/app`). */}
                {estActive ? (
                  <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-primary" />
                ) : null}
                <span className="relative">
                  {c.avatar !== undefined ? (
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-primary-deep',
                        estActive && 'ring-2 ring-primary ring-offset-1 ring-offset-card',
                      )}
                    >
                      {c.avatar}
                    </span>
                  ) : Icone ? (
                    <Icone className="size-6" aria-hidden />
                  ) : null}
                  {c.compte ? (
                    <span
                      aria-hidden
                      data-slot="pastille-onglet"
                      className="absolute -top-1 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold tabular-nums text-primary-foreground ring-2 ring-card"
                    >
                      {c.compte > 99 ? tNav('plafond') : c.compte}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{c.libelle}</span>
              </LienLocalise>
            </li>
          );
        })}
      </ul>
      {children}
    </nav>
  );
}
