import type { StatusTone } from '@/components/console';
import type { RadarTargetStatus } from '@/types/radar';

/** TCK-2469 — le ton de l'état d'une cible : seule une cible active borne la collecte et reçoit des annonces. */
export const TON_DE_LA_CIBLE: Record<RadarTargetStatus, StatusTone> = {
  active: 'success',
  paused: 'attention',
  retired: 'neutral',
};
