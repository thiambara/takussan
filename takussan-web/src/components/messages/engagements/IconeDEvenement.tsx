import { Bell, Handshake } from 'lucide-react';

/** TCK-2972 — les codes d'engagement qui sonnent : le rappel, le retard, la relance, « Tenu ? ». */
const CODES_DE_LA_CLOCHE = new Set(['commitment.due_soon', 'commitment.overdue', 'commitment.reminded', 'commitment.check_requested']);

/** L'icône d'un code : la cloche d'un rappel, la poignée de main d'un autre événement d'engagement, sinon rien. */
export function natureDeLIcone(code: string | undefined | null): 'cloche' | 'poignee' | null {
  if (!code?.startsWith('commitment.')) return null;
  return CODES_DE_LA_CLOCHE.has(code) ? 'cloche' : 'poignee';
}

/**
 * TCK-2972 (ADR-0130) — l'icône d'un événement d'engagement, en ligne seule (`SystemMessageBubble`) comme
 * dans une suite repliée (`EvenementsReplies`). Ne rend rien pour tout autre code.
 */
export function IconeDEvenement({ code, className, testId }: { readonly code: string | undefined | null; readonly className?: string; readonly testId?: string }) {
  const nature = natureDeLIcone(code);
  if (nature === null) return null;
  const proprietes = { className, strokeWidth: 1.75, 'aria-hidden': true as const, 'data-testid': testId };
  return nature === 'cloche' ? <Bell {...proprietes} /> : <Handshake {...proprietes} />;
}
