import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';

import { HomepageDiscovery } from '@/components/property/HomepageDiscovery';
import { alternatesPubliques } from '@/lib/alternates';
import { decouverteDeLAccueil } from '@/lib/queries/public-discovery';
import { isLocale } from '@/i18n/config';

/**
 * Canonique et hreflang de l'accueil — ADR-0026 §1, TCK-433.
 *
 * Le titre et la description restent portés par le layout du groupe : cette page ne les redéclare
 * pas, sans quoi le `title.template` (« %s — Takussan ») s'appliquerait au titre par défaut et
 * suffixerait deux fois.
 *
 * La canonique porte le préfixe de langue : `/fr` sur l'accueil français. Depuis TCK-434, `/` nu
 * rend 307 — une canonique non préfixée désignerait une redirection comme page de référence.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: alternatesPubliques('/', isLocale(locale) ? locale : 'fr') };
}

/**
 * L'accueil public — quatre rangées de biens, **présentes dans le HTML de la première réponse**
 * depuis TCK-432.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI A CHANGÉ, ET CE QUI N'A PAS CHANGÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Cette page faisait neuf lignes et rendait `<HomepageDiscovery />`, qui allait chercher les biens
 * par `useEffect` + `apiFetch`. Un `useEffect` ne s'exécute jamais pendant le rendu serveur :
 * l'accueil de la plateforme ne contenait donc **aucun bien, aucun titre de bien, aucun lien
 * `/properties/<slug>`** (mesuré le 2026-08-27 et re-mesuré le 2026-08-28 : 0/33 titres, 0 lien).
 *
 * ⚠️ **`HomepageDiscovery` reste `'use client'`, et ce n'est pas une concession** — c'est la leçon
 * que TCK-335 a écrite dans `PropertyDetailContent` : *un composant `'use client'` EST rendu en
 * HTML par le serveur ; ce qui manquait, c'était la DONNÉE.* Elle arrive maintenant en prop. La
 * directive, elle, reste indispensable : la personnalisation géographique, le carrousel des biens
 * consultés et les boutons de favoris sont de l'état local.
 *
 * ⚠️ **Cette page n'attend PAS la ville du visiteur.** Elle est devinée côté client par
 * `UserLocationProvider` (ipapi.co, échéance 1200 ms), et un rendu serveur qui attendrait un
 * fournisseur tiers serait un rendu serveur qu'on ne peut pas servir. Le serveur demande donc les
 * rangées **sans ville** — le back-end sert alors son marché de référence et le DIT
 * (`requested_city: null`, `fallback: false`), de sorte que le titre affiché reste vrai des biens
 * affichés. La personnalisation arrive après, et sans repasser par le squelette : cf.
 * `useHomepageDiscovery`.
 */
export default async function Home() {
  const brut = await getLocale();
  const locale = isLocale(brut) ? brut : 'fr';

  // `null` en cas de panne — la page reste servable, et le client reprend le comportement
  // d'avant TCK-432 (squelette, appel, message d'erreur traduit). Cf. `decouverteDeLAccueil`.
  const rangees = await decouverteDeLAccueil(locale);

  return <HomepageDiscovery donneesInitiales={rangees} />;
}
