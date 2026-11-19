/**
 * TCK-2968 — la puce de file part au SERVEUR (`filter[file]`, TCK-2967), entre dans la clé de requête (un
 * compte par file, jamais la page d'une autre), et la liste demande les champs de la boîte.
 */
import { describe, expect, it } from 'vitest';
import { buildQueryString } from '@/lib/api';
import { CONVERSATION_LIST_FIELDS, conversationListParams, filtresCanoniques } from '../conversations-list';

describe('conversationListParams — la file de la boîte (TCK-2968)', () => {
  it('`file` part en `filter[file]`, tel que l’API le lit', () => {
    for (const file of ['vous', 'attente', 'rappel'] as const) {
      const qs = new URLSearchParams(buildQueryString(conversationListParams(1, 30, { file })));
      expect(qs.get('filter[file]')).toBe(file);
    }
    const sans = new URLSearchParams(buildQueryString(conversationListParams(1, 30, {})));
    expect(sans.get('filter[file]')).toBeNull();
  });

  it('la file entre dans les filtres canoniques (la clé de requête) ; « Tous » n’en porte pas', () => {
    expect(filtresCanoniques({ file: 'vous' })).toMatchObject({ file: 'vous' });
    expect(filtresCanoniques({ file: 'vous' })).not.toEqual(filtresCanoniques({ file: 'attente' }));
    expect(filtresCanoniques({})).not.toHaveProperty('file');
  });

  it('la liste demande les champs de la boîte en sparse fieldsets', () => {
    expect(CONVERSATION_LIST_FIELDS).toEqual(
      expect.arrayContaining(['file', 'attend_depuis', 'en_attente_de', 'snoozed_until', 'handled_at', 'assigned_to']),
    );
  });
});
