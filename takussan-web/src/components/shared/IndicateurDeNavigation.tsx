'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useRef, useState } from 'react';

import { BarreDeChargement } from '@/components/shared/BarreDeChargement';
import { decouperLocale, EXTENSIONS_DE_FICHIERS } from '@/i18n/routing';

/**
 * Délai avant d'afficher la barre. Une navigation déjà préchargée se termine en deçà : la barre
 * n'y clignoterait que pour disparaître. Au-delà, le clic se voit dans le dixième de seconde.
 */
export const DELAI_AVANT_AFFICHAGE_MS = 100;

/**
 * Plafond de sûreté. Un lien dont la navigation n'aboutit à AUCUN changement d'URL (une
 * redirection serveur vers la page même, un gestionnaire qui annule sans le dire) laisserait
 * sinon la barre courir indéfiniment — un faux « en cours » est pire que pas de barre.
 */
export const DUREE_MAXIMALE_MS = 15_000;

const MOTIF_FICHIER = new RegExp(`\\.(?:${EXTENSIONS_DE_FICHIERS.join('|')})$`, 'i');

/**
 * Le chemin sert-il une RESSOURCE plutôt qu'une page ?
 *
 * ⚠ Les route handlers de `/api/…` ne sont pas des pages : l'export de données, le reçu d'un
 * paiement, le contrat d'un bail y sont servis EN PIÈCE JOINTE, par un lien ordinaire sans
 * attribut `download` (`DataExportsPanel`, `BookingDetail`, `LeaseDetail`). Le navigateur
 * télécharge, la page reste, l'URL ne change jamais — et la barre courait jusqu'au plafond, le
 * pointeur en « progression » sur toute la page (revue du 2026-09-23). Même chose pour un fichier
 * servi tel quel (`.pdf`, `.xml`…) : l'extension est jugée sur la liste FERMÉE du routage, parce
 * qu'un slug de bien peut contenir un point.
 */
function estUneRessource(pathname: string): boolean {
  if (/^\/api(?:\/|$)/.test(pathname)) return true;
  return MOTIF_FICHIER.test(pathname.split('/').pop() ?? '');
}

/**
 * Le lien cliqué mène-t-il à une AUTRE page de ce site, dans cet onglet ? Rend l'URL visée, ou
 * `null` quand le clic ne déclenche pas de navigation que la barre devrait signaler.
 *
 * Exportée et pure pour être éprouvée cas par cas : chaque `return null` est un faux « en cours »
 * évité — un ⌘-clic ouvre un onglet, une ancre défile, un lien vers la page courante ne change
 * rien.
 */
export function destinationDuClic(evenement: MouseEvent, courante: URL): URL | null {
  if (evenement.button !== 0) return null;
  if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey) return null;

  const cible = evenement.target;
  if (!(cible instanceof Element)) return null;
  const lien = cible.closest('a[href]');
  if (!(lien instanceof HTMLAnchorElement)) return null;
  if (lien.target !== '' && lien.target !== '_self') return null;
  if (lien.hasAttribute('download')) return null;

  let visee: URL;
  try {
    visee = new URL(lien.href, courante);
  } catch {
    return null;
  }
  if (visee.origin !== courante.origin) return null;
  if (estUneRessource(visee.pathname)) return null;
  if (visee.search !== courante.search) return visee;
  if (visee.pathname === courante.pathname) return null; // ancre, ou la page même
  // `/agents` depuis `/fr/agents` : le proxy y ramène la langue courante, donc la même page.
  const sansLangue = decouperLocale(visee.pathname);
  if (sansLangue.locale === null && sansLangue.chemin === decouperLocale(courante.pathname).chemin) {
    return null;
  }
  return visee;
}

type Navigation = { readonly depuis: string; readonly visible: boolean };

function Indicateur() {
  const t = useTranslations('common.status');
  const pathname = usePathname();
  const params = useSearchParams();
  const cle = `${pathname}?${params.toString()}`;

  // La clé de l'URL AFFICHÉE, lue par l'écouteur au moment du clic. Un ref et non une dépendance :
  // réabonner l'écouteur à chaque navigation perdrait un clic survenu entre deux rendus.
  const cleAffichee = useRef(cle);
  useEffect(() => {
    cleAffichee.current = cle;
  }, [cle]);

  const [navigation, setNavigation] = useState<Navigation | null>(null);

  // L'URL affichée a changé : la navigation lancée par le clic est FINIE — ou remplacée par un
  // retour du navigateur, un `router.replace`… Son état se lève ici, pendant le rendu (et non dans
  // un effet, qui laisserait passer un rendu avec la barre). ⚠ Le laisser posé n'est pas neutre :
  // mesuré le 2026-09-23, carte → fiche → retour du navigateur, et la barre RENAISSAIT sur la
  // liste — l'URL y redevient celle d'où le clic était parti — pour courir jusqu'au plafond.
  const [cleVue, setCleVue] = useState(cle);
  if (cle !== cleVue) {
    setCleVue(cle);
    if (navigation !== null) setNavigation(null);
  }

  useEffect(() => {
    let attente: ReturnType<typeof setTimeout> | undefined;
    let plafond: ReturnType<typeof setTimeout> | undefined;

    function arreter() {
      clearTimeout(attente);
      clearTimeout(plafond);
      setNavigation(null);
    }

    function auClic(evenement: MouseEvent) {
      if (destinationDuClic(evenement, new URL(window.location.href)) === null) return;
      clearTimeout(attente);
      clearTimeout(plafond);
      const depuis = cleAffichee.current;
      setNavigation({ depuis, visible: false });
      attente = setTimeout(
        () => setNavigation((n) => (n !== null && n.depuis === depuis ? { depuis, visible: true } : n)),
        DELAI_AVANT_AFFICHAGE_MS,
      );
      plafond = setTimeout(arreter, DUREE_MAXIMALE_MS);
    }

    // Une page restaurée depuis le cache arrière-avant garde son état JavaScript — barre comprise,
    // sur une URL qui, elle, n'a pas bougé.
    function auRetourDuCache(evenement: PageTransitionEvent) {
      if (evenement.persisted) arreter();
    }

    // ⚠ Sur `window`, en phase de BOUILLONNEMENT : React écoute sur la racine du document, donc
    // un gestionnaire qui a appelé `stopPropagation()` (le favori, le comparateur posés sur une
    // carte) arrête l'événement AVANT qu'il n'arrive ici — son clic ne navigue pas, et ne lance
    // pas la barre. `defaultPrevented` ne dirait rien : le `<Link>` de Next l'appelle lui-même
    // pour naviguer côté client.
    window.addEventListener('click', auClic);
    window.addEventListener('pageshow', auRetourDuCache);
    return () => {
      window.removeEventListener('click', auClic);
      window.removeEventListener('pageshow', auRetourDuCache);
      clearTimeout(attente);
      clearTimeout(plafond);
    };
  }, []);

  // Pas de comparaison `depuis !== cle` ici : l'état d'une navigation dont l'URL a changé est déjà
  // levé pendant le rendu, juste au-dessus — une seconde garde ne garderait rien.
  if (navigation === null || !navigation.visible) return null;
  return (
    <>
      <BarreDeChargement libelle={t('loading')} position="ecran" />
      {/* La barre court au bord HAUT de la fenêtre, loin de la carte qu'on vient de cliquer. Au
          bureau, l'œil est sur le pointeur : il passe en « travail en cours » — la convention du
          système, qui dit aussi que la page reste utilisable. Une règle rendue, et non un style
          posé à la main sur `<html>` : elle part d'elle-même avec la barre, démontage compris. */}
      <style>{'html, html * { cursor: progress !important; }'}</style>
    </>
  );
}

/**
 * La barre de chargement de TOUTE navigation par lien — retour testeur du 2026-09-23 (TCK-568).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT : UN CLIC QUI NE CHANGE RIEN À L'ÉCRAN
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * « On a l'impression qu'on n'a pas cliqué. » Une navigation du routeur de Next laisse la page
 * courante IMMOBILE jusqu'à l'arrivée de la suivante, sauf là où un `loading.tsx` la remplace. Or
 * les fiches publiques (bien, agent, agence) n'en ont pas, et ne DOIVENT pas en avoir : une
 * frontière de suspension y ferait partir le 404 d'une fiche inexistante en 200
 * (`[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts`). Chacune attend pourtant
 * plusieurs appels à l'API — mesuré le 2026-09-23 sur la préproduction, 0,4 à 0,8 s CHACUN.
 *
 * Le 2026-09-16, deux déclencheurs avaient reçu leur propre barre (catégories de la navbar, villes
 * de `/agents`) : ce sont des BOUTONS qui naviguent par `router.push` dans une transition. Tous les
 * LIENS — cartes de biens, cartes d'agents, pagination, équipe d'une agence — restaient muets.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il écoute les clics sur les liens internes (cf. {@link destinationDuClic}) et montre
 * {@link BarreDeChargement} en haut de l'écran jusqu'à ce que l'URL change. Il ne voit PAS les
 * navigations lancées par `router.push` : celles-là savent déjà qu'elles naviguent, et portent
 * leur propre barre dans leur transition. Les deux ne se superposent donc pas.
 *
 * Monté UNE fois, dans le layout racine : la console en profite autant que le site public.
 * `useSearchParams` exige une frontière de suspension — elle est ici, pour que le layout n'ait
 * qu'une ligne à porter.
 */
export function IndicateurDeNavigation() {
  return (
    <Suspense fallback={null}>
      <Indicateur />
    </Suspense>
  );
}
