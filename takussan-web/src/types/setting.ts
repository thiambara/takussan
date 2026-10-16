/**
 * Integration types — TCK-023 / TCK-068.
 *
 * Source of truth: `takussan-api/app/Http/Resources/IntegrationResource.php`. Secrets
 * (`credentials`) are never exposed by the API after creation — the backend returns them as
 * `$hidden`.
 */

export interface Integration {
  id: number;
  provider: string;
  agency_id: number | null;
  is_active: boolean;
  last_used_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * TCK-293 (ADR-0046) — l'adresse de notification d'une intégration de paiement : celle que le
 * fournisseur appelle. Le jeton qu'elle porte désigne l'intégration ; il ne sort que par ici.
 */
export interface IntegrationWebhookEndpoint {
  integration_id: number;
  provider: string;
  url: string;
}

/**
 * TCK-602 (ADR-0051 §3) — un fournisseur de paiement et les champs de son schéma
 * (`GET /api/integrations/payment-providers`) : exactement les clés que son pilote lit.
 */
export interface PaymentProviderSchema {
  readonly key: string;
  readonly label: string;
  readonly fields: readonly {
    readonly name: string;
    readonly type: string;
    readonly secret: boolean;
    readonly required: boolean;
  }[];
}

export interface IntegrationTestResult {
  ok: boolean;
  message: string;
  last_used_at?: string | null;
}
