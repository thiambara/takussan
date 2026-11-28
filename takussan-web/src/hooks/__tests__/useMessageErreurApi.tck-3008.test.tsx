import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import fr from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import { useMessageErreurApi, type OptionsDuMessageErreur, type TableDeRefus } from '@/hooks/useMessageErreurApi';

/**
 * TCK-3008 — la cascade du message d'erreur, écrite une fois dans le hook : table (dans l'ordre) → validation
 * (si demandée) → message localisé de l'API → repli. Le traducteur des tables est un faux qui montre la clé et
 * ses valeurs : on juge ce que la cascade CHOISIT, pas le dictionnaire.
 */
function enveloppe({ children }: { readonly children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="Africa/Dakar">
      {children}
    </NextIntlClientProvider>
  );
}

const montre: TableDeRefus['t'] = (cle, valeurs) => (valeurs && Object.keys(valeurs).length > 0 ? `${cle} ${JSON.stringify(valeurs)}` : cle);

function lecteur(options?: OptionsDuMessageErreur) {
  return renderHook(() => useMessageErreurApi(options), { wrapper: enveloppe }).result.current;
}

const TABLE: TableDeRefus = { t: montre, codes: { 'radar.targets.too_many': 'tooMany', 'radar.claim': 'claim' } };

describe('useMessageErreurApi — la cascade (TCK-3008)', () => {
  it('un code de la table donne sa clé, avec les params simples de l’API par défaut', () => {
    const lire = lecteur({ tables: [TABLE] });
    const erreur = new ApiError(422, { code: 'radar.targets.too_many', message: 'Trop.', params: { max: 30, champs: ['a'] } });
    expect(lire(erreur, 'repli')).toBe('tooMany {"max":30}');
  });

  it('le résolveur de paramètres remplace les params de l’API', () => {
    const lire = lecteur({ tables: [{ ...TABLE, parametres: (code, e) => ({ quand: `${code}@${String(e.params.until)}` }) }] });
    const erreur = new ApiError(409, { code: 'radar.claim', message: 'Pris.', params: { until: 'demain' } });
    expect(lire(erreur)).toBe('claim {"quand":"radar.claim@demain"}');
  });

  it('les tables se consultent dans l’ordre : la première qui connaît le code l’emporte', () => {
    const autre: TableDeRefus = { t: (cle) => `autre:${cle}`, codes: { 'radar.claim': 'x', 'seul.ici': 'y' } };
    const lire = lecteur({ tables: [TABLE, autre] });
    expect(lire(new ApiError(409, { code: 'radar.claim' }))).toBe('claim');
    expect(lire(new ApiError(409, { code: 'seul.ici' }))).toBe('autre:y');
  });

  it('un 422 sans code connu dit ses messages de validation, joints, quand la validation est demandée', () => {
    const erreur = new ApiError(422, { message: 'Le nom est trop long. (et 1 autre erreur)', errors: { nom: ['Le nom est trop long.'], ville: ['La ville manque.'] } });
    expect(lecteur({ tables: [TABLE], validation: true })(erreur)).toBe('Le nom est trop long. La ville manque.');
    // Sans la demande, la prose de Laravel l'emporte, comme sans options.
    expect(lecteur({ tables: [TABLE] })(erreur)).toBe('Le nom est trop long. (et 1 autre erreur)');
    expect(lecteur()(erreur)).toBe('Le nom est trop long. (et 1 autre erreur)');
  });

  it('un code inconnu des tables retombe sur le message localisé de l’API, puis sur le repli', () => {
    const lire = lecteur({ tables: [TABLE], validation: true });
    expect(lire(new ApiError(409, { code: 'autre.code', message: 'Déjà fait.' }), 'repli')).toBe('Déjà fait.');
    expect(lire(new ApiError(409, { code: 'autre.code' }), 'repli')).toBe('repli');
  });

  it('sans options, la fonction rendue garde son identité d’un rendu à l’autre', () => {
    const { result, rerender } = renderHook(() => useMessageErreurApi(), { wrapper: enveloppe });
    const premiere = result.current;
    rerender();
    expect(result.current).toBe(premiere);
  });
});
