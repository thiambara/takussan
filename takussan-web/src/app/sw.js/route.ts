import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import { scriptDuServiceWorker, urlApiDepuisEnv } from '@/lib/pwa/service-worker';
import { versionDuDeploiement } from '@/lib/pwa/version';

/**
 * `/sw.js` — le service worker du site (TCK-598, ADR-0052 §4). Le script est ENGENDRÉ par
 * `src/lib/pwa/service-worker.ts`, qui porte les règles de cache ; ce handler ne fait que le servir.
 *
 * ⚠ **Dynamique, et `Cache-Control: no-cache`, délibérément.** Un `sw.js` resservi par un cache
 * HTTP ou un CDN (Cloudflare met les `.js` en cache par défaut devant `preview`) maintiendrait
 * l'ANCIEN worker après un déploiement, avec ses anciens noms de cache — exactement ce que la
 * version dans le nom des caches existe pour empêcher.
 *
 * `/sw.js` n'est pas redirigé vers une langue : le proxy l'exclut (`js` est dans
 * `EXTENSIONS_DE_FICHIERS`, `src/i18n/routing.ts`), éprouvé par `__tests__/route.test.ts`.
 */
export const dynamic = 'force-dynamic';

let versionMemorisee: string | undefined;

export function GET(): Response {
  versionMemorisee ??= versionDuDeploiement();

  const script = scriptDuServiceWorker({
    version: versionMemorisee,
    urlApi: urlApiDepuisEnv(process.env.NEXT_PUBLIC_API_URL),
    textes: { fr: fr.horsLigne, en: en.horsLigne, wo: wo.horsLigne },
  });

  return new Response(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
