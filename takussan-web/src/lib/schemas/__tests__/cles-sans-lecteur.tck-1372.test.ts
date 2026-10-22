import { describe, expect, it } from 'vitest';

import { createLeaseSchema } from '@/lib/schemas/lease';
import { normaliseIntegrationForm, type IntegrationFormValues } from '@/lib/schemas/setting';

/**
 * TCK-1372 (P114.05) — le front n'envoie plus ce que l'API ne lit pas.
 *
 * - `landlord_id` de la création de bail : aucune règle dans `StoreLeaseRequest`, et le service
 *   recalcule le bailleur depuis le bien. `useApiForm` soumet ce que le schéma rend : une clé qu'il
 *   ne déclare pas n'en sort pas.
 * - `provider` de l'édition d'une intégration : aucune règle dans `UpdateIntegrationRequest`, le
 *   champ est désactivé en édition.
 */
describe('clés envoyées pour rien', () => {
  it('la création de bail ne porte plus `landlord_id`', () => {
    const rendu = createLeaseSchema.parse({
      property_id: 11,
      tenant_id: 21,
      landlord_id: 4,
      type: 'residential_rent',
      start_date: '2026-11-01',
      monthly_rent: 150000,
      deposit_amount: 300000,
    });

    expect(rendu).not.toHaveProperty('landlord_id');
  });

  const VALEURS = {
    provider: 'sms_orange',
    is_active: true,
    notes: '',
    sms_client_id: 'cid',
    sms_client_secret: 'csec',
    sms_sender_address: 'tel:+221771111111',
    sms_sender_name: '',
  } as unknown as IntegrationFormValues;

  it('l’édition d’une intégration ne porte plus `provider`', () => {
    expect(normaliseIntegrationForm(VALEURS, 'edit')).not.toHaveProperty('provider');
  });

  it('la création, elle, le porte toujours', () => {
    expect(normaliseIntegrationForm(VALEURS, 'create')).toHaveProperty('provider', 'sms_orange');
  });
});
