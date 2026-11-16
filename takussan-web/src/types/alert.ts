/**
 * Types et canaux d'une alerte de seuil (/api/threshold-alerts, TCK-032 P3).
 *
 * Module SANS dépendance serveur : `components/rapports/alertes/AlertList.tsx` (client) lit
 * `CANAUX_D_ALERTE` ; l'importer depuis `lib/queries/alerts.ts`, qui tire `lib/session.ts`
 * (`next/headers`), cassait `next build` (TCK-2868, vague 92).
 */

export type ThresholdAlert = {
  id: number;
  agency_id: number;
  metric: string;
  operator: '>' | '<' | '>=' | '<=';
  threshold: number | string;
  severity: 'info' | 'warning' | 'critical';
  is_enabled: boolean;
  cooldown_hours: number;
  last_triggered_at: string | null;
  last_value: number | string | null;
  /**
   * TCK-2627 — la valeur ACTUELLE de la mesure (`ThresholdAlertReading`), `null` sans dénominateur ou
   * pour un chiffre consolidé que le lecteur ne lit pas : jamais 0 à sa place.
   */
  current_value?: number | null;
  /** TCK-2627/TCK-2723 — qui est prévenu : le compte, et les noms au seul lecteur qui peut modifier l'alerte. */
  recipients?: { count: number; users: { id: number; name: string | null }[] };
  /** TCK-2627 — les canaux de l'événement (`inapp`, `email`), sans les préférences de chacun. */
  channels?: string[];
  /**
   * TCK-2627 — `include=triggers` : les dix derniers déclenchements, le plus récent d'abord. TCK-2868 —
   * `channel` et `recipients_count` : par quel canal et à combien de personnes il est parti (TCK-2866).
   */
  triggers?: { at: string | null; value: number | null; channel?: AlertChannel | null; recipients_count?: number | null }[];
  /** TCK-2868 — le canal choisi de l'alerte (TCK-2866, ADR-0115) : courriel, WhatsApp, ou les deux. */
  channel?: AlertChannel;
  /** TCK-2868 — le choix des destinataires (`[]` = tous) ; `null` au lecteur qui ne peut pas modifier l'alerte. */
  recipient_ids?: number[] | null;
  /** TCK-2868 — qui peut être choisi pour cette mesure ; `[]` au lecteur qui ne peut pas modifier l'alerte. */
  recipient_candidates?: { id: number; name: string | null }[];
};

/** TCK-2868 — les canaux d'une alerte (`ThresholdAlert::allowedChannels()`). */
export const CANAUX_D_ALERTE = ['email', 'whatsapp', 'both'] as const;
export type AlertChannel = (typeof CANAUX_D_ALERTE)[number];

export type ThresholdAlertInput = {
  metric: string;
  operator: ThresholdAlert['operator'];
  threshold: number;
  severity?: ThresholdAlert['severity'];
  is_enabled?: boolean;
  cooldown_hours?: number;
  /** TCK-2868 — `null` (ou vide) : tous les destinataires possibles de la mesure. */
  recipient_ids?: number[] | null;
  channel?: AlertChannel;
};
