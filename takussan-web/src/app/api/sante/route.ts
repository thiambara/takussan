import { NextResponse } from 'next/server';
import { enTetesServeurAmont, urlSanteApiServeur } from '@/lib/api';

/**
 * TCK-948 (P44.01) — le front joint-il l'API ? 200 si `/up` répond 200, 503 sinon.
 *
 * `/robots.txt`, que lisent le `HEALTHCHECK` de l'image et la preuve d'`images.yml`, ne joint rien :
 * un front dont `API_INTERNAL_URL` vise un hôte injoignable, ou un autre environnement, y était
 * déclaré sain et le déploiement vert. Cette route passe par le chemin des lectures serveur
 * (`API_INTERNAL_URL`, sinon `API_URL`), et la preuve d'`images.yml` et `smoke-web.sh` la lisent.
 *
 * ⚠ Elle n'est PAS le `HEALTHCHECK` du Dockerfile, et c'est voulu : Swarm arrêterait le front à
 * chaque panne de l'API, et le site rendrait une erreur de passerelle au lieu de ses pages.
 *
 * Rien de sensible dans la réponse : ni l'adresse jointe, ni l'erreur. Elles vont au journal.
 */
export const dynamic = 'force-dynamic';

/** Au-delà, l'API est tenue pour injoignable : un hôte qui ne répond pas ne doit pas figer la sonde. */
const DELAI_MS = 3000;

export async function GET() {
  let amont: number | null = null;
  try {
    // Appel partagé : aucun en-tête de visiteur, seulement ceux du chemin interne.
    const reponse = await fetch(urlSanteApiServeur(), {
      headers: await enTetesServeurAmont({ partage: true }),
      cache: 'no-store',
      // Une redirection n'est pas une réponse de l'API : suivie, un `/up` qui renvoie vers une page
      // servie ailleurs (un autre environnement, http → https) rendait 200. Le 3xx reste lisible.
      redirect: 'manual',
      signal: AbortSignal.timeout(DELAI_MS),
    });
    amont = reponse.status;
  } catch (err) {
    console.error('[api/sante]', err);
  }

  const ok = amont === 200;
  return NextResponse.json(ok ? { api: 'ok' } : { api: 'ko', amont }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
