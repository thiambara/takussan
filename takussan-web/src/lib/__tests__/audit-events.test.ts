import { describe, expect, it } from 'vitest';

import { libelleEvenementAudit } from '../audit-events';

/**
 * P06.09 (TCK-2336) — le journal d'audit affiche l'événement traduit (`admin.audit.events.*`), et
 * la description brute seulement pour un événement sans clé.
 */
const traduire = (event: string) => `«${event}»`;

describe('libelleEvenementAudit (P06.09)', () => {
  it('un événement qui a sa clé rend son libellé, pas la description', () => {
    expect(libelleEvenementAudit({ event: 'role_assigned', description: 'role_assigned' }, traduire))
      .toBe('«role_assigned»');
    expect(libelleEvenementAudit({ event: 'exported', description: 'Exported audit trail' }, traduire))
      .toBe('«exported»');
  });

  it('un événement sans clé rend la description brute', () => {
    expect(libelleEvenementAudit({ event: 'super_admin_plan_updated', description: 'Plan modifié' }, traduire))
      .toBe('Plan modifié');
    expect(libelleEvenementAudit({ event: null, description: 'Agent invité' }, traduire)).toBe('Agent invité');
  });

  it('sans description, l’événement brut ; sans rien, null', () => {
    expect(libelleEvenementAudit({ event: 'evenement_de_demain', description: null }, traduire))
      .toBe('evenement_de_demain');
    expect(libelleEvenementAudit({ event: null, description: null }, traduire)).toBeNull();
  });
});
