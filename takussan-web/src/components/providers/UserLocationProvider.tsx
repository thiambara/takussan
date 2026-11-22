'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Géo-IP de l'utilisateur — résolu une fois via ipapi.co, mis en cache 24h dans localStorage,
 * exposé à toute l'app via le Context. N'importe quel composant peut consommer ces infos avec
 * `useUserLocation()` sans déclencher un nouveau fetch.
 *
 * TCK-1225 (P103.05) — la résolution ne part qu'au PREMIER LECTEUR : `useUserLocation()` la
 * demande à son montage. Le fournisseur est monté par la mise en page racine, donc sur toute page,
 * et l'appelait dès son montage : l'IP du visiteur partait chez ce tiers sur la fiche, la liste ou
 * la console, qu'aucun écran n'en lise rien.
 *
 * TCK-537 (décision du porteur du 2026-11-16) — et le réseau ne part qu'au PREMIER GESTE du
 * visiteur : un appui (souris, doigt, stylet) ou une touche du clavier, n'importe où dans la page
 * (`GESTES`). Un lecteur monté ne suffit plus : l'accueil en est un, et l'IP de tout visiteur
 * partait chez ipapi.co au simple chargement de la page. La politique de confidentialité (§ 5,
 * « Géolocalisation approximative ») le dit dans les mêmes termes.
 *  - Au montage d'un lecteur, seul le cache local (24 h) est lu : aucune requête.
 *  - Sans cache ni geste, `loading` retombe à `false` sans ville ; le geste venu, la ville arrive
 *    plus tard, et `loading` ne remonte JAMAIS (un formulaire déjà rendu ne repasse pas en
 *    squelette). Sans cache mais geste déjà fait, `loading` attend la réponse du réseau.
 *  - Le geste est écouté par le fournisseur, monté à la racine : un clic sur le lien qui mène à un
 *    écran lecteur compte, la navigation côté client ne le fait pas oublier.
 *
 * La forme du payload reflète la réponse ipapi (https://ipapi.co/json/).
 * Tous les champs sont optionnels — on n'assume jamais qu'un champ est
 * présent côté consommateur.
 */
export type UserLocation = {
  ip?: string;
  network?: string;
  version?: string;
  city?: string;
  region?: string;
  region_code?: string;
  country?: string;
  country_name?: string;
  country_code?: string;
  country_code_iso3?: string;
  country_capital?: string;
  country_tld?: string;
  continent_code?: string;
  in_eu?: boolean;
  postal?: string | null;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  utc_offset?: string;
  country_calling_code?: string;
  currency?: string;
  currency_name?: string;
  languages?: string;
  country_area?: number;
  country_population?: number;
  asn?: string;
  org?: string;
};

type UserLocationContextValue = {
  /** Réponse brute ipapi — `null` tant que le fetch n'a pas répondu (ou a échoué). */
  location: UserLocation | null;
  /**
   * `true` jusqu'à la lecture du cache (reportée d'une micro-tâche), ou jusqu'à la réponse du réseau
   * si le geste est déjà fait. Sans cache ni geste, retombe à `false` SANS ville (TCK-537) ; ne
   * remonte jamais ensuite.
   */
  loading: boolean;
  /** Raccourci pratique : `location.city` avec fallback Dakar — toujours safe à afficher. */
  city: string;
  /** TCK-1225 — demande la résolution ; appelée par `useUserLocation()`, idempotente. */
  demarrer: () => void;
};

const STORAGE_KEY = 'takussan:user-location';
/** TCK-537 — ce qui compte pour un geste : un appui ou une touche. Ni le chargement, ni le temps. */
export const GESTES = ['pointerdown', 'touchstart', 'keydown'] as const;
const TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CITY = 'Dakar';

const UserLocationContext = createContext<UserLocationContextValue>({
  location: null,
  loading: true,
  city: FALLBACK_CITY,
  demarrer: () => {},
});

type Cached = { data: UserLocation; at: number };

export function UserLocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [demandee, setDemandee] = useState(false);
  /** TCK-537 — le visiteur a-t-il fait un geste dans la page ? */
  const [geste, setGeste] = useState(false);
  /** Le même fait, lisible sans dépendance depuis l'effet du cache. */
  const gesteFait = useRef(false);
  /** TCK-537 — le cache n'a rien rendu : le réseau attend le geste. */
  const [aJoindre, setAJoindre] = useState(false);

  useEffect(() => {
    if (geste) return;
    const surGeste = () => {
      gesteFait.current = true;
      setGeste(true);
    };
    for (const type of GESTES) window.addEventListener(type, surGeste, { capture: true, passive: true });
    return () => {
      for (const type of GESTES) window.removeEventListener(type, surGeste, { capture: true });
    };
  }, [geste]);

  useEffect(() => {
    if (!demandee) return;
    let cancelled = false;

    // Le cache et le fetch passent par le MÊME flux asynchrone, et c'est délibéré.
    //
    // La version d'origine lisait localStorage puis appelait `setLocation` + `setLoading`
    // directement dans le corps de l'effet : un setState synchrone pendant la phase de commit,
    // qui force React à re-rendre l'arbre entier avant même que le navigateur ait peint. Sur un
    // provider monté à la racine, la cascade touche toute la page.
    //
    // La lecture ne peut pas remonter dans un initialiseur paresseux de `useState` : le
    // composant est rendu côté serveur, où `window` n'existe pas, et une valeur lue au premier
    // rendu client ferait diverger l'hydratation. D'où le report explicite ci-dessous.
    void (async () => {
      // Ce `await` sort le `setState` du corps synchrone de l'effet — ce que la règle de lint
      // vise réellement. Ni plus, ni moins.
      //
      // ⚠ Le commentaire qui occupait cette place affirmait que, sans lui, le chemin du cache
      // partait « pendant la phase de commit de l'effet, avant même que le navigateur ait
      // peint ». C'est FAUX : `useEffect` est un effet *passif*, il s'exécute déjà après la
      // peinture (c'est `useLayoutEffect` qui commit de façon bloquante). La cascade décrite
      // n'existait pas, et le raisonnement qui la décrivait était plus assuré que le fait.
      //
      // Ce que ce `await` fait vraiment : il reporte la suite d'une micro-tâche. Le corps d'une
      // fonction `async` s'exécute bien synchroniquement jusqu'au premier `await`, donc sans
      // lui le `setState` du chemin cache resterait dans le corps synchrone de l'effet — ce que
      // `react-hooks/set-state-in-effect` interdit, à juste titre, parce que cela force un
      // second rendu immédiat. Le coût : sur un cache chaud, `loading` retombe une micro-tâche
      // plus tard, donc au minimum un tick de rendu avec le squelette.
      //
      // *Un correctif juste assorti d'une explication fausse se propage quand même — et c'est
      // l'explication qu'on relit, pas le correctif.*
      await Promise.resolve();

      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as Cached;
          if (cached.data && Date.now() - cached.at < TTL_MS) {
            if (!cancelled) {
              setLocation(cached.data);
              setLoading(false);
            }
            return;
          }
        }
      } catch {
        // localStorage indisponible (Safari privé) — on retombe sur le réseau, au geste.
      }

      // TCK-537 — pas de cache. Geste déjà fait (un clic a mené à l'écran lecteur) : le réseau part
      // tout de suite et `loading` attend sa réponse, comme avant — l'assistant hôte fige ses
      // défauts au premier rendu. Sans geste, rien n'est en attente : les lecteurs rendent sans
      // ville (repli), et la ville viendra après le geste, sans repasser par `loading`.
      if (!cancelled) {
        if (!gesteFait.current) setLoading(false);
        setAJoindre(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [demandee]);

  useEffect(() => {
    if (!aJoindre || !geste) return;
    let cancelled = false;

    void (async () => {
      try {
        const r = await fetch('https://ipapi.co/json/');
        const data = r.ok ? ((await r.json()) as UserLocation) : null;
        if (cancelled || !data) return;
        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ data, at: Date.now() } satisfies Cached),
          );
        } catch {
          // ignore quota / private mode errors
        }
        setLocation(data);
      } catch {
        // garde location=null → consommateurs basculent sur leurs fallbacks
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [aJoindre, geste]);

  const city =
    location?.city && location.city.trim() ? location.city.trim() : FALLBACK_CITY;

  return (
    <UserLocationContext.Provider value={{ location, loading, city, demarrer: () => setDemandee(true) }}>
      {children}
    </UserLocationContext.Provider>
  );
}

export function useUserLocation(): UserLocationContextValue {
  const valeur = useContext(UserLocationContext);
  const { demarrer } = valeur;
  useEffect(() => {
    demarrer();
  }, [demarrer]);
  return valeur;
}
