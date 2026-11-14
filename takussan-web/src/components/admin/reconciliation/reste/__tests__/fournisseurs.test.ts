import { describe, expect, it } from 'vitest';

import { fournisseursConnectes } from '../fournisseurs';

describe('fournisseursConnectes (TCK-2675)', () => {
  it('ne garde que les intégrations de paiement actives, une fois chacune', () => {
    expect(
      fournisseursConnectes([
        { provider: 'wave', is_active: false },
        { provider: 'orange_money', is_active: true },
        { provider: 'orange_money', is_active: true },
        { provider: 'mailgun', is_active: true },
        { provider: 'sms_orange', is_active: true },
      ]),
    ).toEqual(['orange_money']);
  });
});
