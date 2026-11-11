'use client';

import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Coins, ExternalLink, Languages, LogOut, ShieldCheck, User as IconeProfil, UserRound, type LucideIcon } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { EspacesDeLaFeuille } from '@/components/profile/EspacesDuMenu';
import { useAuth } from '@/context/AuthContext';
import { useChangementDeLangue } from '@/hooks/useChangementDeLangue';
import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, type Locale } from '@/i18n/config';
import { hrefLocalise } from '@/i18n/navigation';
import { HREF_CREDITS } from '@/lib/navigation/acces-app';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { FOCUS_RING, FOCUS_RING_RENTRANT } from './styles-de-la-barre';

/** Ce que le menu du compte a déjà lu : la feuille ne relit rien. */
export interface LectureDuCompte {
  readonly user: User;
  readonly libelle: string;
  readonly initiales: string | null;
  /** Le solde, quand le compte voit le portefeuille et qu'il est connu ; sinon `null`. */
  readonly solde: number | null;
  /** L'entrée d'administration accessible, s'il y en a une. */
  readonly administration: { readonly href: string; readonly libelle: string } | null;
  readonly hrefPreferences: string;
}

interface FeuilleDuCompteProps extends LectureDuCompte {
  /** Le déclencheur (le pied du tiroir, ou l'espace de l'en-tête d'accueil) : un `<button>`. */
  readonly declencheur: ReactElement;
  /** Le tiroir se referme quand un choix navigue. */
  readonly onNavigate?: () => void;
}

/**
 * TCK-2619 — le menu du compte AU TÉLÉPHONE : une feuille du bas (`FeuilleDuBas`, TCK-2690), et non un
 * menu déroulant posé dans le tiroir (maquette `app-coque`, « Compte et espaces », téléphone). Le même
 * contenu que `MenuDuCompte` — nom et courriel, changement d'espace, crédits, profil, préférences,
 * administration, site public, langue, déconnexion — en lignes de 48 px au pouce.
 *
 * Une feuille est un dialogue : des boutons, pas des `menuitem`. La langue est un groupe de trois
 * boutons à bascule (`aria-pressed`) qui suit le chemin unique du changement de langue.
 */
export function FeuilleDuCompte({
  user,
  libelle,
  initiales,
  solde,
  administration,
  hrefPreferences,
  declencheur,
  onNavigate,
}: FeuilleDuCompteProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const t = useTranslations('nav');
  const tCompte = useTranslations('nav.sidebar.compte');
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const langue = useChangementDeLangue();
  const idLangue = useId();
  const [ouverte, setOuverte] = useState(false);

  const aller = (href: string) => {
    setOuverte(false);
    onNavigate?.();
    router.push(href);
  };

  return (
    <FeuilleDuBas open={ouverte} onOpenChange={setOuverte} titre={tCompte('titre')} declencheur={declencheur}>
      <div data-slot="feuille-du-compte">
        <div className="flex items-center gap-3 pb-3">
          <Avatar className="size-11" aria-hidden>
            {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
            <AvatarFallback className="text-sm font-semibold">
              {initiales ?? <UserRound className="size-5" aria-hidden="true" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-base font-semibold text-foreground">{libelle}</p>
            {user.email ? <p className="truncate text-ui text-muted-foreground">{user.email}</p> : null}
          </div>
        </div>
        <EspacesDeLaFeuille titre={tCompte('changerDEspace')} />
        <div className="border-t border-border pt-2">
          {solde !== null ? (
            <Ligne icone={Coins} libelle={tCompte('credits')} onClick={() => aller(HREF_CREDITS)} slot="solde-du-compte">
              <span className="shrink-0 text-sm font-semibold tabular-nums">{format.number(solde)}</span>
            </Ligne>
          ) : null}
          <Ligne icone={IconeProfil} libelle={t('myProfile')} onClick={() => aller('/app/profile')} />
          <Ligne icone={BellRing} libelle={tCompte('preferences')} onClick={() => aller(hrefPreferences)} />
          {administration ? (
            <Ligne icone={ShieldCheck} libelle={administration.libelle} onClick={() => aller(administration.href)} />
          ) : null}
          <Ligne
            icone={ExternalLink}
            libelle={tCompte('sitePublic')}
            onClick={() => aller(hrefLocalise('/', locale))}
            slot="site-public"
          />
          <div className="flex h-12 items-center gap-3 text-corps">
            <Languages className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <span id={idLangue} className="min-w-0 flex-1 truncate">
              {tCompte('langue')}
            </span>
            <div role="group" aria-labelledby={idLangue} className="inline-flex shrink-0 items-center rounded-lg bg-muted p-0.5 text-xs font-medium">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={code === locale}
                  aria-label={LOCALE_LABELS[code]}
                  disabled={langue.enCours}
                  onClick={() => {
                    if (code === locale) return;
                    setOuverte(false);
                    langue.choisir(code);
                  }}
                  className={cn(
                    'inline-flex h-8 w-10 items-center justify-center rounded-md text-muted-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm disabled:opacity-50',
                    FOCUS_RING,
                  )}
                >
                  {LOCALE_SHORT[code]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 border-t border-border pt-2">
          <Ligne
            icone={LogOut}
            libelle={t('logout')}
            onClick={() => {
              setOuverte(false);
              // TCK-509 / TCK-633 (AC3) — comme le menu : cookie ET jeton tombent ensemble, puis l'accueil.
              void logout().then(() => router.replace(hrefLocalise('/', locale)));
            }}
          />
        </div>
      </div>
    </FeuilleDuBas>
  );
}

function Ligne({
  icone: Icone,
  libelle,
  onClick,
  slot,
  children,
}: {
  readonly icone: LucideIcon;
  readonly libelle: string;
  readonly onClick: () => void;
  readonly slot?: string;
  readonly children?: ReactNode;
}) {
  return (
    <button
      type="button"
      data-slot={slot}
      onClick={onClick}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-lg text-left text-corps text-foreground hover:bg-muted/60',
        FOCUS_RING_RENTRANT,
      )}
    >
      {/* Les icônes de la maquette (« Compte et espaces »), trait 1,5. */}
      <Icone className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{libelle}</span>
      {children}
    </button>
  );
}
