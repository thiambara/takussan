'use client';

import { useRouter } from 'next/navigation';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { Bell, Check, ChevronDown, ChevronsUpDown, Coins, LogOut, ShieldCheck, UserCircle, UserRound } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EspacesDuMenu } from '@/components/profile/EspacesDuMenu';
import { useAuth } from '@/context/AuthContext';
import { useChangementDeLangue } from '@/hooks/useChangementDeLangue';
import { useMyProfiles } from '@/hooks/useProfiles';
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from '@/i18n/config';
import { hrefLocalise } from '@/i18n/navigation';
import { entreeAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import { initialesDe, libelleDe } from '@/lib/identite';
import { HREF_CREDITS, voitLePortefeuille } from '@/lib/navigation/acces-app';
import { useSoldeCredits } from '@/lib/queries/credits-solde';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { FOCUS_RING_RENTRANT } from './styles-de-la-barre';

/** TCK-2491 — la page des préférences de notification (« Réglages » du menu du compte). */
export const HREF_PREFERENCES = '/app/profile/notifications';

interface MenuDuCompteProps {
  readonly user: User;
  /** Le libellé du persona affiché (« Agent »), seconde ligne du pied. */
  readonly libelleRole: string;
  /** Le tiroir se referme quand un choix navigue. */
  readonly onNavigate?: () => void;
  /**
   * TCK-2617 — `en-tete` : le déclencheur de l'en-tête d'ACCUEIL au téléphone (l'espace en bouton :
   * initiales de 28 px, nom de l'espace en 15 px, chevron) ; le même menu s'ouvre dessous. Défaut :
   * le pied de la colonne.
   */
  readonly variante?: 'pied' | 'en-tete';
}

/**
 * TCK-2491 (ADR-0090 §2) — le compte, au pied de la colonne : avatar, nom, « espace · rôle », et UN seul
 * menu qui réunit ce que portait la barre du haut — le changement d'espace (`EspacesDuMenu`, héritier du
 * `ProfileSwitcher` retiré avec elle), le solde de crédits, le profil, les préférences de notification,
 * l'entrée d'administration, la langue (`useChangementDeLangue`, la mécanique de `LanguageSwitcher`) et
 * la déconnexion (celle d'`UserMenu`).
 *
 * - Le nom accessible du déclencheur EST son texte visible (nom, espace · rôle) : WCAG 2.5.3. Base UI
 *   lui ajoute `aria-haspopup` et `aria-expanded`.
 * - Le menu s'ancre au déclencheur et se recale dans l'écran (`collisionPadding` de la primitive) : au
 *   pied de la colonne, il s'ouvre vers le haut, aligné sur son bord gauche — dans le rail aussi, où il
 *   déborde sur le contenu (mesuré à 1280 : 230 px de large, entièrement dans l'écran). Il est en
 *   portail, au `z-[1100]` des panneaux (au-dessus du tiroir, TCK-2485), sur un `voile` qui reçoit
 *   l'appui « à côté » : dans le tiroir, il activait la ligne dessous (revue adverse, I2).
 * - La langue est un groupe de `menuitemradio` (`aria-checked`) : choisir referme le menu et suit le
 *   chemin unique du changement de langue (cookie, préférence de compte, rafraîchissement).
 * - Le solde ne paraît que connu (jamais un « 0 » qui ne serait pas un solde, comme `PastilleCredits`),
 *   et seulement pour qui voit le portefeuille.
 */
export function MenuDuCompte({ user, libelleRole, onNavigate, variante = 'pied' }: MenuDuCompteProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const t = useTranslations('nav');
  const tCompte = useTranslations('nav.sidebar.compte');
  const tAdmin = useTranslations('nav.admin');
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const langue = useChangementDeLangue();
  // TCK-623 — un compte sans nom (téléphone, OAuth) : une silhouette, et ce qui désigne le compte.
  const initiales = initialesDe(user);
  const libelle = libelleDe(user) ?? t('accountFallback');
  // Le nom de l'espace actif : la même lecture (et le même cache) que le changement d'espace.
  const { data: profils } = useMyProfiles();
  const actif = profils?.data.find((p) => p.id === profils.meta.active_profile_id) ?? null;
  const espace = [actif?.agency?.name, libelleRole].filter(Boolean).join(' · ');
  // TCK-633 (lot B) — l'entrée d'administration mène à la première page que le profil peut ouvrir.
  const entree = entreeAdmin(useAccesAdminOuRepli({ roles: user.roles, agencyId: user.agency_id }));
  const voitLeSolde = voitLePortefeuille(user.roles);
  const solde = useSoldeCredits({ enabled: voitLeSolde });

  const aller = (href: string) => {
    onNavigate?.();
    router.push(href);
  };

  return (
    <DropdownMenu>
      {variante === 'en-tete' ? (
        <DropdownMenuTrigger
          data-slot="espace-de-l-en-tete"
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 pr-2 text-left transition-colors hover:bg-foreground/5 data-popup-open:bg-foreground/5',
            FOCUS_RING_RENTRANT,
          )}
        >
          {/* Le nom accessible est le texte visible : l'espace (ou le compte, sans agence). */}
          <Avatar className="size-7" aria-hidden>
            {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
            <AvatarFallback className="text-legende font-semibold">
              {initiales ?? <UserRound className="size-4" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
          {/* TCK-2617 — L'ESPACE, tel que le pied le nomme (`espace`, première partie) : l'agence, sinon le
              persona (« Locataire »), jamais le nom de la personne — il est déjà dans la feuille. */}
          <span className="min-w-0 truncate text-corps font-semibold text-foreground">{actif?.agency?.name ?? (libelleRole || libelle)}</span>
          <ChevronDown className="size-4 shrink-0 stroke-2 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
      ) : (
      <DropdownMenuTrigger
        data-slot="pied-du-compte"
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-foreground/5 data-popup-open:bg-foreground/5 icones:justify-center',
          FOCUS_RING_RENTRANT,
        )}
      >
        {/* Les initiales sont une image du nom, qui suit : hors du nom accessible.
            TCK-2691 (C7) — 28,8 px au bureau, 36 px dans le tiroir ; le repli PAR DÉFAUT de l'avatar
            (TCK-2687 : `secondary` / `primary-deep`, 6,72:1) et non plus une pastille d'encre noire. Le
            « soi » de la maquette (`accent/15`, `text-accent`) tombe sous 4,5:1 sur la colonne
            (`AppSidebar.contraste.test.tsx`, ADR-0106 exception 1). */}
        <Avatar className="size-8 max-md:size-9" aria-hidden>
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
          <AvatarFallback className="text-xs font-semibold max-md:text-avatar-36">
            {initiales ?? <UserRound className="size-4" aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 icones:sr-only">
          <span className="block truncate text-sm font-semibold text-foreground">{libelle}</span>
          {/* Un séparateur LU : sans lui, le nom accessible collait le nom à l'espace. */}
          {espace ? <span className="sr-only">, </span> : null}
          <span className="block truncate text-xs text-muted-foreground">{espace}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground icones:hidden" aria-hidden />
      </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="start" voile data-slot="menu-du-compte" className="w-64 max-w-[calc(100vw-var(--spacing)*4)]">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-foreground">{libelle}</p>
          {user.email ? <p className="truncate text-xs text-muted-foreground">{user.email}</p> : null}
        </div>
        <DropdownMenuSeparator />
        {/* Le changement d'espace : rien quand il n'y a pas de choix ; son titre ne paraît qu'avec lui. */}
        <EspacesDuMenu titre={tCompte('changerDEspace')} />
        {voitLeSolde && solde !== null ? (
          <DropdownMenuItem data-slot="solde-du-compte" onClick={() => aller(HREF_CREDITS)}>
            <Coins className="size-4" aria-hidden="true" />
            <span className="flex-1">{tCompte('credits')}</span>
            <span className="tabular-nums text-muted-foreground">{format.number(solde)}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => aller('/app/profile')}>
          <UserCircle className="size-4" aria-hidden="true" />
          <span>{t('myProfile')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => aller(HREF_PREFERENCES)}>
          <Bell className="size-4" aria-hidden="true" />
          <span>{tCompte('preferences')}</span>
        </DropdownMenuItem>
        {entree ? (
          <DropdownMenuItem onClick={() => aller(entree.href)}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>{tAdmin(entree.cle)}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <MenuPrimitive.Group>
          <MenuPrimitive.GroupLabel className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
            {tCompte('langue')}
          </MenuPrimitive.GroupLabel>
          <MenuPrimitive.RadioGroup value={locale} onValueChange={(code: Locale) => langue.choisir(code)} disabled={langue.enCours}>
            {LOCALES.map((code) => (
              <MenuPrimitive.RadioItem
                key={code}
                value={code}
                lang={code}
                closeOnClick
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-muted data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
              >
                <span className="inline-flex size-4 items-center justify-center" aria-hidden>
                  <MenuPrimitive.RadioItemIndicator>
                    <Check className="size-4" />
                  </MenuPrimitive.RadioItemIndicator>
                </span>
                <span className="flex-1">{LOCALE_LABELS[code]}</span>
                <span className="text-xs text-muted-foreground" aria-hidden>
                  {LOCALE_SHORT[code]}
                </span>
              </MenuPrimitive.RadioItem>
            ))}
          </MenuPrimitive.RadioGroup>
        </MenuPrimitive.Group>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            // TCK-509 — par le contexte : le cookie ET le jeton du client tombent ensemble. TCK-633
            // (AC3) — une déconnexion VOLONTAIRE ramène à l'accueil, comme depuis `UserMenu`.
            void logout().then(() => router.replace(hrefLocalise('/', locale)));
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span>{t('logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
