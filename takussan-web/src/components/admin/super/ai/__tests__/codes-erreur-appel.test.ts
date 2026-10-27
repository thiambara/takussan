import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { ERREURS_APPEL_IA } from '../codes-erreur-appel';

/** TCK-2399 — tout code d'échec d'appel affiché a son libellé dans chaque langue. */
describe('ERREURS_APPEL_IA', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]])('chaque code a son libellé en %s', (_langue, messages) => {
    const libelles = messages.superAdmin.pages.ai.callErrors as Record<string, string>;
    for (const cle of Object.values(ERREURS_APPEL_IA)) {
      expect(libelles[cle], cle).toBeTruthy();
    }
  });
});
