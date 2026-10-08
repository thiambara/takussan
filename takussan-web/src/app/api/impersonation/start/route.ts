import { NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME } from '@/lib/constants';
import type { ImpersonationDemarree } from '@/lib/impersonation';
import { API_URL, poserLaSession } from '@/lib/impersonation-serveur';

/**
 * TCK-600 (ADR-0055 §6) — démarrer une session d'impersonation.
 *
 * Appelle l'API avec le jeton de l'OPÉRATEUR (step-up compris : il est porté par ce jeton), range
 * le jeton d'impersonation dans le cookie httpOnly et rend au navigateur `{session_id, expires_at,
 * target}` — **jamais le jeton**. Un refus de l'API (motif, cible, step-up) est relayé tel quel :
 * son corps ne porte aucun secret.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const operateur = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!operateur) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const corps = (await request.json().catch(() => null)) as { user_id?: unknown; reason?: unknown } | null;
  const cible = Number(corps?.user_id);
  if (!Number.isInteger(cible) || cible <= 0) {
    return NextResponse.json({ code: 'invalid_json_body' }, { status: 400 });
  }

  const enTetes: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${operateur}`,
  };
  const langue = request.headers.get('accept-language');
  if (langue) enTetes['Accept-Language'] = langue;

  const amont = await fetch(`${API_URL}/api/admin/users/${cible}/impersonate`, {
    method: 'POST',
    headers: enTetes,
    body: JSON.stringify({ reason: corps?.reason }),
  });
  const reponseApi = (await amont.json().catch(() => null)) as {
    data?: ImpersonationDemarree & { token?: string };
  } | null;

  if (!amont.ok || !reponseApi?.data?.token) {
    return NextResponse.json(reponseApi ?? { code: 'server_error' }, { status: amont.ok ? 502 : amont.status });
  }

  const { token, session_id: sessionId, expires_at: expiresAt, target } = reponseApi.data;
  const reponse = NextResponse.json(
    { data: { session_id: sessionId, expires_at: expiresAt, target } satisfies ImpersonationDemarree },
    { status: 201 },
  );
  poserLaSession(reponse, token, expiresAt);
  return reponse;
}
