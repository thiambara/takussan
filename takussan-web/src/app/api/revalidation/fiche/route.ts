import { createHmac, timingSafeEqual } from 'node:crypto';

import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import { etiquetteDeFiche } from '@/lib/queries/public-property';

/**
 * TCK-598 (ADR-0052 §2) — l'API demande au front d'expirer les données en cache d'une ou plusieurs
 * fiches publiques. `POST /api/revalidation/fiche`, corps `{"slugs": ["…"]}`.
 *
 * L'appel est SIGNÉ par `RevalidatePublicPropertyPage` (côté API) : HMAC-SHA256 de
 * `<horodatage>.<corps brut>` avec `PUBLIC_CACHE_REVALIDATE_SECRET`, en-tête
 * `X-Takussan-Signature: t=<horodatage>,v1=<hex>`. Refusés, en 401 et sans rien expirer : une
 * signature absente, fausse ou vieille de plus de {@link FENETRE_SECONDES} s (rejeu), et tout appel
 * quand le secret n'est pas configuré — un handler sans secret serait un bouton public « vider le
 * cache ». La comparaison est à temps constant.
 *
 * `expire: 0` : l'entrée expire IMMÉDIATEMENT. Un bien qui vient de quitter le public ne doit pas
 * être resservi une fois de plus pendant une revalidation en arrière-plan.
 *
 * Le corps est lu en TEXTE, avant tout `JSON.parse` : la signature porte sur les octets reçus, pas
 * sur une resérialisation.
 */
export const FENETRE_SECONDES = 300;

/** Plafond défensif : l'API envoie un ou deux slugs (ancien et nouveau). */
const SLUGS_MAX = 50;

const FORME_DE_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,254}$/;

function signatureValide(corps: string, entete: string | null, secret: string, maintenant: number): boolean {
  if (!entete) return false;
  const parties = new Map(
    entete.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
    }),
  );
  const t = parties.get('t') ?? '';
  const v1 = parties.get('v1') ?? '';
  if (!/^\d{1,12}$/.test(t) || !/^[0-9a-f]{64}$/.test(v1)) return false;
  if (Math.abs(maintenant - Number(t)) > FENETRE_SECONDES) return false;

  const attendue = createHmac('sha256', secret).update(`${t}.${corps}`).digest();
  return timingSafeEqual(attendue, Buffer.from(v1, 'hex'));
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.PUBLIC_CACHE_REVALIDATE_SECRET ?? '';
  const corps = await request.text();

  if (
    secret === '' ||
    !signatureValide(corps, request.headers.get('x-takussan-signature'), secret, Math.floor(Date.now() / 1000))
  ) {
    return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });
  }

  let slugs: unknown;
  try {
    slugs = (JSON.parse(corps) as { slugs?: unknown }).slugs;
  } catch {
    slugs = undefined;
  }
  if (
    !Array.isArray(slugs) ||
    slugs.length === 0 ||
    slugs.length > SLUGS_MAX ||
    !slugs.every((s): s is string => typeof s === 'string' && FORME_DE_SLUG.test(s))
  ) {
    return NextResponse.json({ code: 'invalid_json_body' }, { status: 422 });
  }

  for (const slug of new Set(slugs)) {
    revalidateTag(etiquetteDeFiche(slug), { expire: 0 });
  }

  return NextResponse.json({ revalidated: slugs.length });
}
