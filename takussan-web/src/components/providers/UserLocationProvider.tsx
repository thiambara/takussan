'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Géo-IP de l'utilisateur — résolu une fois au chargement du site via
 * ipapi.co, mis en cache 24h dans localStorage, exposé à toute l'app via
 * le Context. N'importe quel composant peut consommer ces infos avec
 * `useUserLocation()` sans déclencher un nouveau fetch.
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
  /** `true` pendant le tout premier fetch (ignore le cache hit, qui est synchrone). */
  loading: boolean;
  /** Raccourci pratique : `location.city` avec fallback Dakar — toujours safe à afficher. */
  city: string;
};

const STORAGE_KEY = 'takussan:user-location';
const TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CITY = 'Dakar';

const UserLocationContext = createContext<UserLocationContextValue>({
  location: null,
  loading: true,
  city: FALLBACK_CITY,
});

type Cached = { data: UserLocation; at: number };

export function UserLocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Le cache et le fetch passent par le MÊME flux asynchrone, et c'est délibéré.
    //
    // La version précédente lisait localStorage puis appelait `setLocation` +
    // `setLoading` directement dans le corps de l'effet : un setState synchrone
    // pendant la phase de commit, qui force React à re-rendre l'arbre entier avant
    // même que le navigateur ait peint (`react-hooks/set-state-in-effect`). Sur un
    // provider monté à la racine, ce re-rendu en cascade touche toute la page — et
    // c'était le chemin le plus FRÉQUENT, puisque le cache dure 24 h.
    //
    // La lecture ne peut pas non plus remonter dans un initialiseur paresseux de
    // `useState` : le composant est rendu côté serveur, où `window` n'existe pas, et
    // une valeur lue au premier rendu client ferait diverger l'hydratation.
    void (async () => {
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
        // localStorage indisponible (Safari privé) — on tombe sur le fetch.
      }

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
  }, []);

  const city =
    location?.city && location.city.trim() ? location.city.trim() : FALLBACK_CITY;

  return (
    <UserLocationContext.Provider value={{ location, loading, city }}>
      {children}
    </UserLocationContext.Provider>
  );
}

export function useUserLocation(): UserLocationContextValue {
  return useContext(UserLocationContext);
}
