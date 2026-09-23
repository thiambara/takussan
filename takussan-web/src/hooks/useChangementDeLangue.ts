'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { setLocaleAction } from '@/app/actions/locale';
import { cheminLocalise, estCheminLocalisable } from '@/i18n/routing';
import type { Locale } from '@/i18n/config';

/**
 * La mécanique du changement de langue — [ADR-0026](../../../docs/adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md) §5.
 *
 * Extraite de `LanguageSwitcher` par TCK-550 pour que le menu déroulant de bureau et le contrôle
 * segmenté du menu mobile et du pied de page (`ChoixDeLangue`) changent de langue par UN SEUL
 * chemin. Deux implémentations divergeraient au premier correctif — c'est le motif que le ticket
 * interdisait.
 *
 * Elle fait DEUX choses, et l'union est nécessaire :
 *
 * 1. **Elle écrit le cookie** (`setLocaleAction`) — et, pour un utilisateur connecté, la
 *    préférence de compte (`PATCH /api/users/me`), pour que les surfaces qui ne portent pas la
 *    langue dans leur URL — la console, `/auth`, `/onboarding` — suivent le même choix.
 * 2. **Elle navigue.** Sur une page publique, changer de langue change l'URL
 *    (`/fr/properties?type=villa` → `/wo/properties?type=villa`) : chemin ET requête conservés.
 *    C'est ce qui rend le choix partageable, et ce qui fait que le retour arrière ramène à la
 *    langue précédente.
 *
 * ⚠ Hors de la surface publique, `usePathname()` rend un chemin non localisable (`/app/overview`) :
 * il n'y a alors rien à naviguer, et seul le cookie change. Ne pas « corriger » ce cas en préfixant
 * quand même — la console n'a pas de route `[locale]`, ce serait un 404.
 */
export function useChangementDeLangue() {
  const locale = useLocale() as Locale;
  const [enCours, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  const choisir = (suivante: Locale) => {
    if (suivante === locale) return;
    startTransition(async () => {
      await setLocaleAction(suivante);
      if (estCheminLocalisable(pathname)) {
        // ⚠ `window.location.search` et non `useSearchParams()` : ce hook force la page qui monte
        // l'appelant sous une frontière de suspension au build (« useSearchParams() should be
        // wrapped in a suspense boundary »), et les appelants sont montés dans la Navbar et le
        // pied de page — donc sur toute la surface publique. Ici la lecture n'a lieu que dans le
        // gestionnaire de clic, où le navigateur existe par construction.
        const requete = window.location.search;
        router.push(cheminLocalise(pathname, suivante) + requete);
        // ⚠ TCK-550 — le layout RACINE (`<html lang>`, et la locale dont hérite le provider de
        // `[locale]/(public)`) est partagé entre `/fr/…` et `/wo/…` : la navigation douce ne le
        // re-rend pas. Sans ce rafraîchissement, il ne suivait le changement que si le
        // `revalidatePath` de `setLocaleAction` gagnait la course — mesuré : 2 passages sur 5
        // restaient en `lang="fr"` sur une page en wolof, la langue courante mal marquée. Le
        // routeur traite ses actions dans l'ordre : ce `refresh` porte sur l'URL d'arrivée.
        router.refresh();
      }
    });
  };

  return { locale, enCours, choisir };
}
