'use client';

import { useRouter } from 'next/navigation';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Check, ChevronDown, Coins, LogOut, Plus, UserCircle, UserRound } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCompteursDuMenu } from '@/components/layout/useCompteursDuMenu';
import type { EntreeRendue } from '@/components/layout/useMenuDeLEspace';
import { useChangementDeLangue } from '@/hooks/useChangementDeLangue';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from '@/i18n/config';
import { hrefLocalise } from '@/i18n/navigation';
import { initialesDe, libelleDe } from '@/lib/identite';
import { HREF_COMPTE, libellePublic, lignesDeMonEspace, REQUETE_BARRE_PUBLIQUE } from '@/lib/navigation/barre-publique';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { useEspacePublic } from './useEspacePublic';
import { useLibelleDuCompteur } from './useLibelleDuCompteur';
import { useSoldeDuPortefeuille } from './useSoldeDuPortefeuille';
import { HREF_CREDITS } from '@/lib/navigation/acces-app';
import { useDetailDuLoyer, useRappelDuPersona } from './useRappelDuPersona';

/** Les destinations qui portent l'action principale d'un pro : « Publier un bien » en tête du menu. */
const ACTIONS_DE_PUBLICATION: ReadonlySet<string> = new Set(['publier-bien', 'proposer-bien']);

const STYLE_LIGNE = 'min-h-12 gap-3 px-3 py-2';

/**
 * TCK-2494 (ADR-0091 §5) — le menu « Mon espace » de l'en-tête de bureau : les lignes du persona actif
 * (`lignesDeMonEspace`, dérivées de la MÊME composition que `/app`), avec leurs compteurs ; « Publier
 * un bien » en tête pour les pros ; puis « Ouvrir mon espace », la langue et la déconnexion.
 *
 * Le point sur l'avatar dit qu'une ligne attend (un compteur non nul). Le changement d'espace vit sur
 * l'écran « Moi » (`/account`) : il lit l'espace `profile`, que la coque publique ne sert pas.
 */
export function MenuMonEspace({ user }: { readonly user: User }) {
  const t = useTranslations('navigationPublique');
  const tNav = useTranslations('nav');
  const tSidebar = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const tCompte = useTranslations('nav.sidebar.compte');
  const router = useRouter();
  const locale = useLocale() as Locale;
  const { logout } = useAuth();
  const langue = useChangementDeLangue();
  // Le menu n'existe qu'en bureau (`hidden lg:flex` chez l'appelant) : ses compteurs n'y sont sondés que là.
  const bureau = !useMatchesMedia(REQUETE_BARRE_PUBLIQUE);
  const espace = useEspacePublic(user);
  const { lignes, messagerie, suite } = lignesDeMonEspace(espace.groupesDeLaDisposition, espace.persona);
  const toutes = [...lignes, ...(messagerie ? [messagerie] : []), ...suite];
  const compteurs = useCompteursDuMenu(toutes, { agencyIsStandard: espace.agencyIsStandard, actif: bureau });
  const rappel = useRappelDuPersona(espace.persona, { actif: bureau });
  const action = espace.menu.action && ACTIONS_DE_PUBLICATION.has(espace.menu.action.id) ? espace.menu.action : null;

  const initiales = initialesDe(user);
  const libelleCompte = libelleDe(user) ?? tNav('accountFallback');
  const libelle = (e: EntreeRendue) => {
    const court = libellePublic(e.id, espace.persona);
    if (court) return t(`onglets.${court}`);
    return e.labelSpace === 'nav.admin' ? tAdmin(e.labelKey) : tSidebar(e.labelKey);
  };
  const compteDe = (e: EntreeRendue) => (e.counterKey ? compteurs[e.counterKey] : 0);
  const enAttente = toutes.reduce((somme, e) => somme + compteDe(e), 0);
  const libelleCompteur = useLibelleDuCompteur();
  const detailDuLoyer = useDetailDuLoyer(rappel);
  const detail = (e: EntreeRendue): string | null => {
    if (e.id === 'paiements' && detailDuLoyer) return detailDuLoyer;
    const compte = compteDe(e);
    return e.counterKey && compte > 0 ? libelleCompteur(e.counterKey, compte) : null;
  };
  const aller = (href: string) => router.push(hrefLocalise(href, locale));
  // TCK-642 — dès `xl`, la pastille de crédits de l'en-tête porte le solde ; entre `lg` et `xl` elle
  // n'a pas la place (l'en-tête tient sur une ligne, TCK-2494 AC4) : le menu la reprend, solde compris.
  const enteteSansPastille = !useMatchesMedia('(width >= 80rem)');
  const solde = useSoldeDuPortefeuille(user);
  const format = useFormatter();

  const ligne = (e: EntreeRendue) => {
    const Icone = e.icon;
    const compte = compteDe(e);
    const d = detail(e);
    return (
      <DropdownMenuItem key={e.id} data-ligne={e.id} className={STYLE_LIGNE} onClick={() => aller(e.href)}>
        <Icone className="size-[18px] shrink-0 text-primary-deep" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-foreground">{libelle(e)}</span>
          {d ? <span className="block truncate text-[13px] text-muted-foreground">{d}</span> : null}
        </span>
        {compte > 0 ? (
          <span aria-hidden className="text-sm font-semibold tabular-nums text-primary">
            {compte > 99 ? tSidebar('onglets.plafond') : compte}
          </span>
        ) : null}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="mon-espace"
        // Le nom dit ce qui attend ; posé d'un bloc, sans texte masqué que Chrome séparerait d'une espace
        // (« Mon espace , 60 éléments… », revue de TCK-2494).
        aria-label={enAttente > 0 ? `${t('monEspace.bouton')}, ${t('monEspace.enAttente', { count: enAttente })}` : undefined}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-popup-open:border-foreground"
      >
        <span className="relative">
          <Avatar className="size-8 bg-secondary" aria-hidden>
            {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-secondary text-xs font-semibold text-primary-deep">
              {initiales ?? <UserRound className="size-4" aria-hidden />}
            </AvatarFallback>
          </Avatar>
          {enAttente > 0 ? (
            <span aria-hidden data-slot="point-mon-espace" className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-card" />
          ) : null}
        </span>
        {t('monEspace.bouton')}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-slot="menu-mon-espace" className="w-[360px] max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Avatar className="size-10 bg-secondary" aria-hidden>
            {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-secondary text-sm font-semibold text-primary-deep">
              {initiales ?? <UserRound className="size-5" aria-hidden />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">{libelleCompte}</p>
            {espace.nomDeLEspace ? <p className="truncate text-sm text-muted-foreground">{espace.nomDeLEspace}</p> : null}
          </div>
        </div>
        <div className="max-h-[min(36rem,calc(100dvh-10rem))] overflow-y-auto p-1">
          {action ? (
            <div className="px-2 pb-1 pt-2">
              <DropdownMenuItem
                onClick={() => aller(action.href)}
                className="h-11 justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground data-highlighted:bg-[var(--primary-deep)] data-highlighted:text-primary-foreground"
              >
                <Plus className="size-4" aria-hidden />
                {libelle(action)}
              </DropdownMenuItem>
            </div>
          ) : null}
          {espace.plusieursEspaces ? (
            <DropdownMenuItem className="px-3 py-2 text-sm text-muted-foreground" onClick={() => aller(HREF_COMPTE)}>
              {t('monEspace.changerDEspace')}
            </DropdownMenuItem>
          ) : null}
          {lignes.map(ligne)}
          {messagerie ? ligne(messagerie) : null}
          {enteteSansPastille && solde !== null ? (
            <DropdownMenuItem
              data-ligne="credits"
              aria-label={tNav('creditsBalance', { count: solde })}
              className={STYLE_LIGNE}
              onClick={() => aller(HREF_CREDITS)}
            >
              <Coins className="size-[18px] shrink-0 text-primary-deep" aria-hidden />
              <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">{tSidebar('credits')}</span>
              <span aria-hidden data-slot="solde-credits" className="text-sm font-semibold tabular-nums text-foreground">
                {format.number(solde)}
              </span>
            </DropdownMenuItem>
          ) : null}
          {suite.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              {suite.map(ligne)}
            </>
          ) : null}
        </div>
        <div className="border-t border-border p-2">
          <DropdownMenuItem
            onClick={() => router.push('/app')}
            className="h-11 justify-center rounded-xl bg-foreground text-[15px] font-medium text-background data-highlighted:bg-foreground data-highlighted:text-background data-highlighted:ring-2 data-highlighted:ring-ring"
          >
            {t('monEspace.ouvrir')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/app/profile')} className="mt-1">
            <UserCircle className="size-4" aria-hidden />
            <span>{tNav('myProfile')}</span>
          </DropdownMenuItem>
          <MenuPrimitive.Group>
            <MenuPrimitive.GroupLabel className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
              {tCompte('langue')}
            </MenuPrimitive.GroupLabel>
            <MenuPrimitive.RadioGroup
              value={locale}
              onValueChange={(code: Locale) => langue.choisir(code)}
              disabled={langue.enCours}
              className="flex gap-1 px-2"
            >
              {LOCALES.map((code) => (
                <MenuPrimitive.RadioItem
                  key={code}
                  value={code}
                  lang={code}
                  closeOnClick
                  aria-label={LOCALE_LABELS[code]}
                  className={cn(
                    'relative flex min-h-9 flex-1 cursor-pointer select-none items-center justify-center gap-1 rounded-md px-2 text-sm outline-none',
                    'data-highlighted:bg-muted data-checked:font-semibold data-checked:text-foreground text-muted-foreground',
                  )}
                >
                  <MenuPrimitive.RadioItemIndicator>
                    <Check className="size-3.5" aria-hidden />
                  </MenuPrimitive.RadioItemIndicator>
                  <span aria-hidden>{LOCALE_SHORT[code]}</span>
                </MenuPrimitive.RadioItem>
              ))}
            </MenuPrimitive.RadioGroup>
          </MenuPrimitive.Group>
          <DropdownMenuItem
            className="mt-1"
            onClick={() => {
              // TCK-509 — par le contexte, et la navigation APRÈS la révocation ; TCK-633 — une
              // déconnexion volontaire ramène à l'accueil localisé, jamais à `/auth/login`.
              void logout().then(() => router.push(hrefLocalise('/', locale)));
            }}
          >
            <LogOut className="size-4" aria-hidden />
            <span>{t('reglages.deconnexion')}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
