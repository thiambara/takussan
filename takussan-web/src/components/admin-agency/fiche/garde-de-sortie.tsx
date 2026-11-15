'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { destinationDuClic } from '@/components/shared/IndicateurDeNavigation';
import { useAvertissementDepart } from '@/hooks/useAvertissementDepart';

/**
 * TCK-2670 — la garde de sortie de la fiche de l'agence, tant qu'une modification n'est pas
 * enregistrée :
 *
 * - **un lien qui quitte la fiche** (barre latérale, flèche de retour du téléphone, lien de la
 *   vérification…) est retenu AVANT tout autre écouteur — capture sur `window`, donc avant le routeur
 *   de Next et l'indicateur de navigation — et une boîte demande « Rester » ou « Abandonner les
 *   modifications ». Abandonner remet la saisie à l'enregistré, puis rejoue le clic ;
 * - **un lien de section** de la fiche (`?section=…` sur la même page) passe : le formulaire reste
 *   monté, rien ne se perd ;
 * - **recharger, fermer l'onglet, un lien externe** : la boîte du navigateur (`beforeunload`).
 *
 * Limites, écrites au ticket : le bouton « Précédent » du navigateur et le geste de retour ne
 * s'annulent pas (`popstate`) — dans la fiche, ils ramènent au sommaire sans rien perdre, puisque
 * le formulaire reste monté et la barre visible ; hors de la fiche, ils partent. La palette de
 * commandes navigue par le routeur, sans lien : elle n'est pas retenue.
 */
export function useGardeDeSortie(actif: boolean, abandonner: () => void) {
  const [enAttente, setEnAttente] = useState<HTMLAnchorElement | null>(null);
  const laisserPasser = useRef(false);
  useAvertissementDepart(actif);

  useEffect(() => {
    if (!actif) return;
    function retenir(evenement: MouseEvent) {
      if (laisserPasser.current) return;
      const courante = new URL(window.location.href);
      const visee = destinationDuClic(evenement, courante);
      if (visee === null) return;
      // Un lien de section de la fiche : même page, `?section=` — il ne quitte rien.
      if (visee.pathname === courante.pathname && visee.searchParams.has('section')) return;
      const lien = (evenement.target as Element).closest('a[href]');
      if (!(lien instanceof HTMLAnchorElement)) return;
      evenement.preventDefault();
      evenement.stopPropagation();
      setEnAttente(lien);
    }
    window.addEventListener('click', retenir, { capture: true });
    return () => window.removeEventListener('click', retenir, { capture: true });
  }, [actif]);

  return {
    ouvert: enAttente !== null,
    rester: () => setEnAttente(null),
    partir: () => {
      const lien = enAttente;
      setEnAttente(null);
      abandonner();
      if (!lien) return;
      laisserPasser.current = true;
      try {
        lien.click();
      } finally {
        laisserPasser.current = false;
      }
    },
  };
}

export function DialogueDeSortie({
  ouvert,
  rester,
  partir,
  nombre,
}: {
  readonly ouvert: boolean;
  readonly rester: () => void;
  readonly partir: () => void;
  readonly nombre: number;
}) {
  const t = useTranslations('admin.agencyConfig.fiche.sortie');
  return (
    <Dialog open={ouvert} onOpenChange={(o) => (o ? null : rester())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('titre')}</DialogTitle>
          <DialogDescription>{t('texte', { n: nombre })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={partir}>
            {t('abandonner')}
          </Button>
          <Button type="button" onClick={rester}>
            {t('rester')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
