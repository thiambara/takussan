import { NextResponse } from 'next/server';

/**
 * TCK-600 (ADR-0055 §6, verif-600 B1) — le SEUL passage d'un segment dynamique de route handler
 * (`[id]`, `[...path]`, `[[...path]]`) vers l'URL de l'API.
 *
 * Next DÉCODE chaque segment avant de le donner au handler : `impersonate%3F` arrive en
 * `impersonate?`, `..%2Fadmin` en `../admin`. Recollé tel quel dans l'URL amont, `fetch` lit le `?`
 * comme une requête, le `#` comme un fragment, et RÉSOUT les `..` : cinq proxys de l'API relayaient
 * ainsi `POST /api/admin/users/{u}/impersonate` — et le jeton de la réponse — jusqu'à la page.
 *
 * Un segment qui porte `/`, `?`, `#` ou `\`, ou qui vaut `.` ou `..`, n'a aucune lecture légitime
 * ici : il est REFUSÉ (400, sans appel amont), pas nettoyé. Les autres sont ré-encodés.
 *
 * `scripts`-garde : `src/app/api/__tests__/segments-amont.garde.test.ts` refuse tout route handler
 * dynamique qui construirait son URL sans passer par ici.
 */

const INTERDITS = /[/?#\\]/;

/** Le segment ré-encodé, ou `null` s'il doit être refusé. */
export function segmentAmont(segment: string): string | null {
  if (segment === '.' || segment === '..' || INTERDITS.test(segment)) return null;
  return encodeURIComponent(segment);
}

/** Les segments d'un catch-all, ré-encodés et joints par `/`, ou `null` si l'un est refusé. */
export function cheminAmont(segments: readonly string[]): string | null {
  const encodes = segments.map(segmentAmont);
  return encodes.some((s) => s === null) ? null : encodes.join('/');
}

export function reponseSegmentInvalide(): NextResponse {
  return NextResponse.json({ code: 'invalid_path' }, { status: 400 });
}
