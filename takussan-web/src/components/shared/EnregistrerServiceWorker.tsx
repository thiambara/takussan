'use client';
import { useEffect } from 'react';

/**
 * TCK-598 (V18) — enregistre `/sw.js` (portée `/`) après le chargement, en production seulement.
 *
 * Monté dans le layout du groupe PUBLIC et pas à la racine : l'installation est une fonction du
 * site public, et la console n'a rien à gagner d'un worker dont le seul contenu hors ligne est
 * la liste des favoris. Une fois enregistré, il contrôle tout de même `/app` — sans y rien mettre
 * en cache : ses règles sont une liste d'autorisation (`src/lib/pwa/service-worker.ts`).
 *
 * Hors production, rien : en `next dev`, les ressources de `/_next/static` ne sont pas
 * versionnées, et un cache « d'abord » y servirait du code périmé.
 */
export function EnregistrerServiceWorker({ actif = process.env.NODE_ENV === 'production' }: { readonly actif?: boolean }) {
  useEffect(() => {
    if (!actif || !('serviceWorker' in navigator)) return;
    const enregistrer = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Sans worker, le site fonctionne : seule l'installation et la page hors ligne manquent.
      });
    };
    if (document.readyState === 'complete') {
      enregistrer();
      return;
    }
    window.addEventListener('load', enregistrer, { once: true });
    return () => window.removeEventListener('load', enregistrer);
  }, [actif]);
  return null;
}
