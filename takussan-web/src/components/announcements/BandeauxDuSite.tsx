'use client';

import { useContext, useEffect, useSyncExternalStore } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { MaintenanceBanner } from '@/components/maintenance/MaintenanceBanner';
import { GlobalAnnouncementBanner } from '@/components/announcements/GlobalAnnouncementBanner';

/**
 * TCK-572 — les bandeaux du site (maintenance, annonce) : UN seul emplacement affiché par page, et
 * jamais sous une barre fixe.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT (mesuré le 2026-09-24, Chrome headless, réponses de l'API substituées)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le layout racine rendait les deux bandeaux AVANT la page. Or la barre publique est `fixed
 * top-0` : elle les recouvrait. À 320 px, une annonce de 127 px était invisible, sa croix se
 * trouvait sous le bouton « Ouvrir le menu » — l'appui qui devait la fermer OUVRAIT LE MENU — et
 * l'accueil commençait 127 px plus bas (`<h1>` à 244 au lieu de 117). La maintenance (`sticky
 * top-0`) restait collée SOUS la barre en défilant. Dans l'espace connecté, les bandeaux
 * précédaient une coque `h-dvh` : le document débordait de leur hauteur, et la maintenance
 * collante recouvrait la barre haute une fois défilé.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Une page dont le haut est une barre fixe ou une coque pleine hauteur monte ses bandeaux DANS SON
 * FLUX, sous la barre (`emplacement="page"` : `NavbarSpacer`, `AppShell`). L'emplacement du
 * layout racine (`"racine"`) ne sert que les pages qui n'en déclarent aucun (`/auth`,
 * `/onboarding`…) — il s'efface dès qu'une page en monte un. Le bandeau reste du contenu : il
 * défile avec la page et ne réserve aucune hauteur fixe, ce qui laisse intactes les géométries
 * calées sur la barre (cales, `scroll-mt-*`, carte mobile).
 *
 * Deux instances lisent le même cache react-query (mêmes clés) : aucune requête en double.
 *
 * Hors de la couche de données de l'application (un composant de page monté seul, sans
 * `QueryProvider` — c'est le cas des tests de page), il n'y a rien à afficher : l'emplacement
 * reste vide au lieu de faire échouer le rendu de la page qui l'héberge.
 */

let emplacementsDePage = 0;
const abonnes = new Set<() => void>();

function sAbonner(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
  };
}

function prevenir(): void {
  abonnes.forEach((rappel) => rappel());
}

const unePageLesPorte = () => emplacementsDePage > 0;
const aucunePageAuServeur = () => false;

export interface BandeauxDuSiteProps {
  /** `page` : sous la barre de la page. `racine` : repli du layout racine, effacé par le premier. */
  readonly emplacement: 'racine' | 'page';
}

export function BandeauxDuSite({ emplacement }: BandeauxDuSiteProps) {
  const effacee = useSyncExternalStore(sAbonner, unePageLesPorte, aucunePageAuServeur);
  const avecDonnees = useContext(QueryClientContext) !== undefined;

  useEffect(() => {
    if (emplacement !== 'page') return undefined;
    emplacementsDePage += 1;
    prevenir();
    return () => {
      emplacementsDePage -= 1;
      prevenir();
    };
  }, [emplacement]);

  if (!avecDonnees || (emplacement === 'racine' && effacee)) return null;

  return (
    <div data-slot="bandeaux-du-site" data-emplacement={emplacement}>
      <MaintenanceBanner />
      <GlobalAnnouncementBanner />
    </div>
  );
}
