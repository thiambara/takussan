import { describe, expect, expectTypeOf, it } from 'vitest';
import { useUpdateParticipantRole } from '@/lib/queries/conversations';
import { archiveProperties } from '@/lib/queries/super-admin';
import type { ApiResponse } from '@/types/api';
import type { BulkFailure } from '@/types/agent-crm';
import type { Conversation } from '@/types/message';

/**
 * TCK-952 (P45.03) — deux types de réponse alignés sur ce que l'API rend.
 *
 * La garde vit dans `npx tsc --noEmit` : `expectTypeOf` ne s'exécute pas, il échoue à la
 * compilation quand les deux types divergent.
 *
 * - `PATCH api/conversations/{id}/participants/{user}` rend `data` = une `ConversationResource`
 *   entière (`ConversationParticipantController::update`), pas `{ user_id, role }`.
 * - `POST api/properties/bulk-archive` rend `failed` en liste `{ id, reason }`
 *   (`PropertyBulkArchiveService::archive`), pas en nombre.
 */
type ReponseDuRole = NonNullable<ReturnType<typeof useUpdateParticipantRole>['data']>;
type ReponseDeLArchivage = Awaited<ReturnType<typeof archiveProperties>>;

export function typesDeReponse() {
  expectTypeOf<ReponseDuRole>().toEqualTypeOf<ApiResponse<Conversation>>();
  expectTypeOf<ReponseDeLArchivage['failed']>().toEqualTypeOf<BulkFailure[]>();
}

describe('types de réponse alignés sur l’API (TCK-952)', () => {
  it('la garde vit dans `tsc --noEmit`, pas ici', () => {
    expect(typeof typesDeReponse).toBe('function');
  });
});
