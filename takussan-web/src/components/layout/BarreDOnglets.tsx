'use client';

import type { RefObject } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { User } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { cn } from '@/lib/utils';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useCurrentLocale } from '@/i18n/hooks';
import { cheminLocalise } from '@/i18n/routing';
import { APP_EXACT_ROOTS, resolveActiveHref } from '@/lib/navigation/active-path';
import { DISPOSITIONS } from '@/lib/navigation/dispositions';
import { ongletsDuMenu } from '@/lib/navigation/onglets';
import type { NavCounterKey } from '@/lib/navigation/types';
import { FOCUS_RING } from './styles-de-la-barre';
import { useMenuDeLEspace } from './useMenuDeLEspace';
import { COMPTEURS_DE_MODERATION, useCompteursDuMenu } from './useCompteursDuMenu';
import { REQUETE_DE_LA_BARRE } from './plein-ecran';
import { AnnonceDesNonLus } from './AnnonceDesNonLus';

/** Une case : 72 px de large à 360 (cinq colonnes), toute la hauteur de la barre (56 px) — cibles ≥ 44 px. */
const STYLE_CASE =
  'relative flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight transition-colors';

interface BarreDOngletsProps {
  readonly user: User;
  readonly agencyIsStandard?: boolean;
  readonly typeProfilActif?: ProfileType | null;
  readonly agencySuspended?: boolean;
  /**
   * TCK-2483 (ADR-0089, amendement « modules par agence ») — les codes de module que l'agence masque,
   * passés par la coque. Requis : un lecteur du menu qui l'oublierait rendrait un onglet masqué.
   */
  readonly modulesMasques: readonly string[];
  /** Le tiroir est ouvert : rendu en `aria-expanded` sur « Menu ». */
  readonly menuOuvert: boolean;
  readonly onOuvrirMenu: () => void;
  /** Le bouton « Menu », à qui le tiroir rend le focus à sa fermeture (`finalFocus`, AC3). */
  readonly refMenu: RefObject<HTMLButtonElement | null>;
}

/**
 * TCK-2481 (ADR-0089 §3) — la barre d'onglets de `/app` sous `md` : les quatre destinations du
 * quotidien du persona actif, puis « Menu », seule porte du tiroir depuis que le burger a quitté la
 * barre haute.
 *
 * - Les onglets sont des entrées DU MENU du persona (`useMenuDeLEspace` → `ongletsDuMenu`) : la
 *   barre n'ouvre rien que le tiroir n'ouvre pas, et un onglet absent cède sa place, jamais un
 *   cadenas. Ils se lisent sur les groupes de la DISPOSITION (`groupesDeLaDisposition`), pas sur le
 *   menu rendu : une épingle (TCK-2480) range le menu, elle ne déplace pas un onglet.
 * - Ses compteurs sont CEUX du menu (`useCompteursDuMenu`), sondés seulement sous `md`.
 * - Enfant flex de la coque `h-dvh`, après le `<main>` : le `<main>` rétrécit de sa hauteur exacte
 *   (`--barre-onglets-hauteur`), rien de la page ne passe dessous (TCK-503).
 */
export function BarreDOnglets({
  user,
  agencyIsStandard,
  typeProfilActif,
  agencySuspended,
  modulesMasques,
  menuOuvert,
  onOuvrirMenu,
  refMenu,
}: BarreDOngletsProps) {
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const pathname = usePathname();
  const locale = useCurrentLocale();
  // La barre n'existe que sous `md` (`md:hidden`), et n'y sonde que dessous — par la MÊME plage que le CSS.
  const sousMd = useMatchesMedia(REQUETE_DE_LA_BARRE);
  const { persona, entrees, groupesDeLaDisposition } = useMenuDeLEspace({
    user,
    agencyIsStandard,
    typeProfilActif,
    agencySuspended,
    modulesMasques,
  });
  const onglets = ongletsDuMenu(groupesDeLaDisposition, DISPOSITIONS[persona].onglets);
  const counters = useCompteursDuMenu(onglets, { agencyIsStandard, actif: sousMd });
  // Résolu sur TOUTES les entrées, comme la barre latérale : une sous-page d'une entrée qui n'est
  // pas un onglet n'en allume aucun à tort.
  const activeHref = resolveActiveHref(
    pathname,
    entrees.map((e) => e.href),
    APP_EXACT_ROOTS,
  );
  const libelleCompteur = (cle: NavCounterKey, count: number) =>
    COMPTEURS_DE_MODERATION.has(cle) ? tAdmin('pendingBadge', { count }) : t(`counters.${cle}`, { count });

  return (
    <nav
      aria-label={t('onglets.navLabel')}
      data-slot="barre-onglets"
      className="h-[var(--barre-onglets-hauteur)] shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-full">
        {onglets.map((onglet) => {
          const Icone = onglet.icon;
          const actif = onglet.href === activeHref;
          const compte = onglet.counterKey ? counters[onglet.counterKey] : 0;
          const libelle = onglet.labelSpace === 'nav.admin' ? tAdmin(onglet.labelKey) : t(onglet.labelKey);
          return (
            <li key={onglet.href} className="min-w-0 flex-1 basis-0">
              <Link
                href={onglet.publique ? cheminLocalise(onglet.href, locale) : onglet.href}
                aria-current={actif ? 'page' : undefined}
                // Le nom accessible CONTIENT le libellé visible (WCAG 2.5.3), puis le compte exact —
                // la pastille, elle, est muette (`aria-hidden`) et plafonnée.
                aria-label={
                  onglet.counterKey && compte > 0
                    ? t('onglets.nomAvecCompteur', { libelle, compteur: libelleCompteur(onglet.counterKey, compte) })
                    : undefined
                }
                className={cn(
                  STYLE_CASE,
                  FOCUS_RING,
                  actif ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {/* L'onglet actif se lit par une FORME (ce trait), un poids et `aria-current` —
                    jamais par la seule teinte. */}
                {actif ? (
                  <span
                    aria-hidden
                    data-slot="indicateur-onglet"
                    className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-primary"
                  />
                ) : null}
                <span className="relative">
                  <Icone className="size-5" aria-hidden />
                  {compte > 0 ? (
                    <span
                      aria-hidden
                      data-slot="pastille-onglet"
                      className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground ring-2 ring-card"
                    >
                      {compte > 99 ? t('onglets.plafond') : compte}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{libelle}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1 basis-0">
          <button
            ref={refMenu}
            type="button"
            onClick={onOuvrirMenu}
            aria-haspopup="dialog"
            aria-expanded={menuOuvert}
            className={cn(STYLE_CASE, FOCUS_RING, 'text-muted-foreground hover:text-foreground')}
          >
            <Menu className="size-5" aria-hidden />
            <span className="max-w-full truncate">{t('onglets.menu')}</span>
          </button>
        </li>
      </ul>
      {/* TCK-2481 (revue, I1) — la région live des nouveaux non-lus sous `md` (WCAG 4.1.3) : la
          pastille est muette et le bouton flottant qui l'annonçait ne se rend plus sur `/app`. */}
      <AnnonceDesNonLus compte={counters.unreadMessages} actif={sousMd} />
    </nav>
  );
}
