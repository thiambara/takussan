/**
 * TCK-620 (ADR-0060) — hors production, l'API rend le code envoyé par SMS dans la réponse de la
 * requête qui l'a émis, sous `otp_preview`. C'est l'API seule qui décide (drapeau
 * `OTP_PREVIEW_ENABLED` ET `APP_ENV` local / staging) : le front affiche ce qu'il reçoit, et rien
 * quand la clé manque — ce qui est toujours le cas en production.
 */
export function codeApercu(reponse: unknown): string | null {
  if (!reponse || typeof reponse !== 'object') return null;
  const code = (reponse as { otp_preview?: unknown }).otp_preview;
  return typeof code === 'string' && /^\d{6}$/.test(code) ? code : null;
}
