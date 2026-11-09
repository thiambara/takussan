'use client';

import { Suspense, type ComponentType, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Heart,
  LogOut,
  Plus,
  ShieldCheck,
  Store,
  UserCircle,
  UserRound,
  Users,
} from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { destinationPublique, hrefConnexion } from '@/components/auth/lien-connexion';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ChoixDeLangue } from '@/components/shared/ChoixDeLangue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { useCompteursDuMenu } from '@/components/layout/useCompteursDuMenu';
import type { EntreeRendue } from '@/components/layout/useMenuDeLEspace';
import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';
import { espacesAProposer } from '@/lib/espaces';
import { useFavorites } from '@/lib/favoritesStore';
import { initialesDe, prenomDe } from '@/lib/identite';
import { formaterTelephone } from '@/lib/phone';
import { libellePublic, PARAM_DEPUIS, sectionsDeMoi } from '@/lib/navigation/barre-publique';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { profileTypeLabel } from '@/components/profile/ProfileBadge';
import { CarteDeRappel } from './CarteDeRappel';
import { useEspacePublic } from './useEspacePublic';
import { useLibelleDuCompteur } from './useLibelleDuCompteur';
import { useSoldeDuPortefeuille } from './useSoldeDuPortefeuille';
import { useDetailDuLoyer, useRappelDuPersona } from './useRappelDuPersona';

/** Les destinations qui portent l'action principale d'un pro : « Publier un bien » en tête de « Moi » (ADR-0091 §3). */
const ACTIONS_DE_PUBLICATION: ReadonlySet<string> = new Set(['publier-bien', 'proposer-bien']);

/**
 * TCK-2493 (ADR-0091 §3) — l'écran de la case 5 de la barre publique : « Compte » pour l'anonyme,
 * « Moi » pour le connecté. Il porte ce que le menu hamburger public portait (langue, légal,
 * connexion, déconnexion) et, connecté, l'espace du persona.
 */
export function EcranDuCompte() {
  const { user } = useAuth();
  return user ? <EcranMoi user={user} /> : <EcranCompte />;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Une ligne
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function Rangee({
  href,
  icone: Icone,
  titre,
  detail,
  compte,
  valeur,
  nomAccessible,
}: {
  readonly href: string;
  readonly icone: ComponentType<{ className?: string }>;
  readonly titre: string;
  readonly detail?: string | null;
  readonly compte?: number;
  /** Une valeur à lire en fin de ligne (le solde de crédits), en chiffres tabulaires. */
  readonly valeur?: string | null;
  readonly nomAccessible?: string;
}) {
  return (
    <li>
      <LienLocalise
        href={href}
        aria-label={nomAccessible}
        className="flex min-h-14 items-center gap-3.5 py-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-xl bg-muted text-primary-deep" aria-hidden>
          <Icone className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-foreground">{titre}</span>
          {detail ? <span className="block truncate text-sm text-muted-foreground">{detail}</span> : null}
        </span>
        {valeur ? (
          <span aria-hidden data-slot="solde-credits" className="text-[15px] font-semibold tabular-nums text-foreground">
            {valeur}
          </span>
        ) : null}
        {compte ? (
          <span aria-hidden className="text-[15px] font-semibold tabular-nums text-primary">
            {compte > 99 ? '99+' : compte}
          </span>
        ) : null}
        <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden />
      </LienLocalise>
    </li>
  );
}

function CartePublier({ question }: { readonly question: string }) {
  const t = useTranslations('navigationPublique.compte.publier');
  return (
    <div className="mt-7 flex items-center gap-3 rounded-2xl bg-secondary/60 p-4">
      <Store className="size-5 flex-none text-primary-deep" aria-hidden />
      <p className="flex-1 text-[15px] text-foreground">
        {question}{' '}
        <LienLocalise href="/publish" className="font-medium underline underline-offset-4 hover:text-primary">
          {t('lien')}
        </LienLocalise>
      </p>
    </div>
  );
}

/** Langue, annuaires et pages légales — puis la déconnexion pour le connecté. */
function Reglages({ deconnexion }: { readonly deconnexion?: ReactNode }) {
  const t = useTranslations('navigationPublique.reglages');
  return (
    <section aria-labelledby="reglages-du-compte" className="mt-8 border-t border-border pt-6">
      <h2 id="reglages-du-compte" className="font-display text-[17px] font-semibold tracking-[-0.02em] text-foreground">
        {t('titre')}
      </h2>
      <ChoixDeLangue className="mt-3 justify-between py-2" />
      <ul className="mt-1 divide-y divide-border">
        <Rangee href="/agencies" icone={Building2} titre={t('agences')} />
        <Rangee href="/agents" icone={Users} titre={t('agents')} />
        <Rangee href={ROUTES_LEGALES.terms} icone={FileText} titre={t('conditions')} />
        <Rangee href={ROUTES_LEGALES.privacy} icone={ShieldCheck} titre={t('confidentialite')} />
      </ul>
      {deconnexion}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Compte — l'anonyme
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function EcranCompte() {
  const t = useTranslations('navigationPublique.compte');
  const pathname = usePathname() ?? '/';
  const { count, isHydrated } = useFavorites();
  const garde: { readonly icone: ComponentType<{ className?: string }>; readonly titre: string; readonly detail: string }[] = [
    { icone: Heart, titre: t('garde.favoris'), detail: isHydrated ? t('garde.favorisDetail', { count }) : '' },
    { icone: CalendarDays, titre: t('garde.visites'), detail: t('garde.visitesDetail') },
    { icone: Bell, titre: t('garde.alertes'), detail: t('garde.alertesDetail') },
  ];
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-6 sm:px-6">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-foreground">{t('titre')}</h1>
      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-[17px] font-semibold text-foreground">{t('connexion.titre')}</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">{t('connexion.texte')}</p>
        <Suspense fallback={<LienDeConnexion href={hrefConnexion(pathname)} />}>
          <LienDeConnexionDepuis pathname={pathname} />
        </Suspense>
      </section>
      <h2 className="mt-7 font-display text-lg font-semibold tracking-[-0.02em] text-foreground">{t('garde.titre')}</h2>
      <ul className="mt-3 space-y-3.5">
        {garde.map(({ icone: Icone, titre, detail }) => (
          <li key={titre} className="flex gap-3.5">
            <span className="mt-0.5 inline-flex size-10 flex-none items-center justify-center rounded-xl bg-secondary text-primary-deep" aria-hidden>
              <Icone className="size-5" />
            </span>
            <div>
              <p className="text-[15px] font-medium leading-snug text-foreground">{titre}</p>
              {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <CartePublier question={t('publier.question')} />
      <Reglages />
    </div>
  );
}

function LienDeConnexion({ href }: { readonly href: string }) {
  const t = useTranslations('navigationPublique.compte');
  return (
    <LienLocalise href={href} className={cn(buttonVariants(), 'mt-4 h-12 w-full rounded-xl text-[15px] font-semibold')}>
      {t('connexion.action')}
    </LienLocalise>
  );
}

/**
 * TCK-568 — la case « Compte » emporte la page quittée (`?depuis=`, `hrefDuCompte`) : « Se connecter »
 * y ramène. Filtrée par `destinationPublique` (jamais une redirection ouverte) ; sans elle, la
 * connexion revient ici, à l'écran « Moi ».
 */
function LienDeConnexionDepuis({ pathname }: { readonly pathname: string }) {
  const depuis = destinationPublique(useSearchParams()?.get(PARAM_DEPUIS));
  return <LienDeConnexion href={hrefConnexion(depuis ?? pathname)} />;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Moi — le connecté
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

function EcranMoi({ user }: { readonly user: User }) {
  const t = useTranslations('navigationPublique');
  const tNav = useTranslations('nav');
  const tSidebar = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const router = useRouter();
  const locale = useLocale() as Locale;
  const { logout } = useAuth();
  const espace = useEspacePublic(user);
  // TCK-642 — « Crédits » porte le solde, et ne paraît que quand il est connu.
  const solde = useSoldeDuPortefeuille(user);
  const format = useFormatter();
  const sections = sectionsDeMoi(espace.groupesDeLaDisposition)
    .map((sec) => ({ ...sec, entrees: sec.entrees.filter((e) => e.id !== 'credits' || solde !== null) }))
    .filter((sec) => sec.entrees.length > 0);
  const compteurs = useCompteursDuMenu(
    sections.flatMap((s) => s.entrees),
    { agencyIsStandard: espace.agencyIsStandard },
  );
  const rappel = useRappelDuPersona(espace.persona);
  const action = espace.menu.action && ACTIONS_DE_PUBLICATION.has(espace.menu.action.id) ? espace.menu.action : null;
  const prenom = prenomDe(user);
  const initiales = initialesDe(user);
  const libelle = (e: EntreeRendue) => {
    const court = libellePublic(e.id, espace.persona);
    if (court) return t(`onglets.${court}`);
    return e.labelSpace === 'nav.admin' ? tAdmin(e.labelKey) : tSidebar(e.labelKey);
  };
  const detailDuLoyer = useDetailDuLoyer(rappel);
  const detail = (e: EntreeRendue) => (e.id === 'paiements' ? detailDuLoyer : null);
  const libelleCompteur = useLibelleDuCompteur();

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-10 pt-6 sm:px-6">
      <div className="flex items-center gap-3.5">
        <Avatar className="size-14 bg-secondary" aria-hidden>
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-secondary text-base font-semibold text-primary-deep">
            {initiales ?? <UserRound className="size-6" aria-hidden />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {prenom ? t('moi.bonjour', { prenom }) : t('moi.bonjourSansNom')}
          </h1>
          {user.phone || user.email ? (
            <p className="truncate text-[15px] text-muted-foreground">
              {user.phone ? formaterTelephone(user.phone) : user.email}
            </p>
          ) : null}
        </div>
      </div>

      {espace.plusieursEspaces ? <ChangerDEspace /> : null}

      {action ? (
        <LienLocalise
          href={action.href}
          className={cn(buttonVariants(), 'mt-4 h-12 w-full gap-2 rounded-xl text-[15px] font-semibold')}
        >
          <Plus className="size-5" aria-hidden />
          {libelle(action)}
        </LienLocalise>
      ) : null}

      <div className="mt-5 empty:hidden">
        <CarteDeRappel />
      </div>

      {sections.map((s) => (
        <section key={s.id} aria-labelledby={s.titre ? `moi-${s.id}` : undefined} className="mt-6">
          {s.titre ? (
            <h2 id={`moi-${s.id}`} className="font-display text-[17px] font-semibold tracking-[-0.02em] text-foreground">
              {tSidebar(`groupes.${s.titre}`)}
            </h2>
          ) : null}
          <ul className="mt-1 divide-y divide-border">
            {s.entrees.map((e) => {
              const compte = e.counterKey ? compteurs[e.counterKey] : 0;
              return (
                <Rangee
                  key={e.id}
                  href={e.href}
                  icone={e.icon}
                  titre={libelle(e)}
                  detail={detail(e)}
                  compte={compte}
                  valeur={e.id === 'credits' && solde !== null ? format.number(solde) : null}
                  nomAccessible={
                    e.id === 'credits' && solde !== null
                      ? tNav('creditsBalance', { count: solde })
                      : e.counterKey && compte > 0
                      ? tSidebar('onglets.nomAvecCompteur', {
                          libelle: libelle(e),
                          compteur: libelleCompteur(e.counterKey, compte),
                        })
                      : undefined
                  }
                />
              );
            })}
          </ul>
        </section>
      ))}

      <LienLocalise
        href="/app"
        className="mt-4 inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline underline-offset-4"
      >
        {t('moi.ouvrirEspace')}
      </LienLocalise>

      {espace.menu.carte ? <CartePublier question={t('compte.publier.question')} /> : null}

      <Reglages
        deconnexion={
          <ul className="divide-y divide-border border-t border-border">
            <Rangee href="/app/profile" icone={UserCircle} titre={tNav('myProfile')} />
            <li>
              <button
                type="button"
                onClick={() => {
                  // TCK-509 — par le contexte : le cookie ET le jeton du client tombent ensemble ; une
                  // déconnexion volontaire ramène à l'accueil.
                  void logout().then(() => router.replace(hrefLocalise('/', locale)));
                }}
                className="flex min-h-14 w-full items-center gap-3.5 py-2 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="inline-flex size-10 flex-none items-center justify-center rounded-xl bg-muted text-primary-deep" aria-hidden>
                  <LogOut className="size-5" />
                </span>
                <span className="flex-1 text-[15px] font-medium text-foreground">{t('reglages.deconnexion')}</span>
              </button>
            </li>
          </ul>
        }
      />
    </div>
  );
}

/**
 * Le changement d'espace, en tête de « Moi » (ADR-0091 §3) : les espaces que le sélecteur de `/app`
 * propose (`espacesAProposer`, TCK-497), par la même mutation (`useSwitchActiveProfile`). Elle pose
 * le profil actif dans `AuthContext` : la barre change sans rechargement (AC4).
 */
function ChangerDEspace() {
  const t = useTranslations('navigationPublique.moi.espaces');
  const tTypes = useTranslations('profile.types');
  const { data } = useMyProfiles();
  const bascule = useSwitchActiveProfile();
  const actifId = data?.meta.active_profile_id ?? null;
  const espaces = espacesAProposer(data?.data ?? [], actifId);
  if (espaces.length <= 1) return null;
  return (
    <section aria-labelledby="moi-espaces" className="mt-5 rounded-2xl border border-border bg-card p-2">
      <h2 id="moi-espaces" className="px-2 pb-1 pt-1.5 text-sm font-semibold text-muted-foreground">
        {t('titre')}
      </h2>
      <ul>
        {espaces.map((p) => {
          const actif = p.id === actifId;
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={actif}
                disabled={bascule.isPending}
                data-espace={p.id}
                onClick={() => {
                  if (!actif && !bascule.isPending) bascule.mutate(p.id);
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="inline-flex size-9 flex-none items-center justify-center rounded-lg bg-secondary text-primary-deep" aria-hidden>
                  <Building2 className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-foreground">
                    {p.agency?.name ?? t('personnel')}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">{profileTypeLabel(p.type, tTypes)}</span>
                </span>
                {actif ? (
                  <>
                    <Check className="size-5 flex-none text-success" aria-hidden />
                    <span className="sr-only">{t('actif')}</span>
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
