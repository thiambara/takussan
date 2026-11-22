import { describe, expect, it } from 'vitest';
import { compteDesPieces, envoisAFaire, motDEtat, nineaCompact, nineaValide, profilDesPieces, type PieceDuProfil } from '../pieces';

const p = (code: string, state: PieceDuProfil['state'], required = true): PieceDuProfil => ({ code, state, required, kind: 'file' });

describe('TCK-2614 — les pièces d’un profil', () => {
  it('le NINEA : la forme de l’API (7 chiffres, puis chiffre, lettre, chiffre), espaces tolérés, minuscule acceptée', () => {
    expect(nineaValide('0 123 456 7G2')).toBe(true);
    expect(nineaValide('0123456 7g2')).toBe(true);
    expect(nineaCompact(' 0 123 456 7g2 ')).toBe('01234567G2');
    for (const faux of ['', '0123 45', '01234567GG', '0123456AG2', '01234567G23', '0123456-7G2']) expect(nineaValide(faux)).toBe(false);
  });

  it('« 1 sur 3 » : les requises envoyées ou vérifiées, sur les requises — une facultative ne compte pas', () => {
    expect(compteDesPieces([p('cni', 'verified'), p('rib', 'missing'), p('ninea', 'sent')])).toEqual({ envoyees: 2, requises: 3 });
    expect(compteDesPieces([p('cni', 'rejected'), p('insurance', 'sent', false)])).toEqual({ envoyees: 0, requises: 1 });
    // Décision 2b — le NINEA d'un particulier (« 1 sur 2 » de la maquette a-3).
    expect(compteDesPieces([p('cni', 'missing'), p('rib', 'sent'), p('ninea', 'missing', false)])).toEqual({ envoyees: 1, requises: 2 });
  });

  it('le mot de chaque état, `rejected` compris', () => {
    expect(['missing', 'sent', 'verified', 'rejected'].map((e) => motDEtat(e as PieceDuProfil['state']))).toEqual([
      'aFournir',
      'envoyee',
      'verifiee',
      'aRefaire',
    ]);
  });

  it('le relais d’envoi du profil actif ; un profil sans pièces n’en a pas', () => {
    expect(profilDesPieces('owner:3')).toEqual({ type: 'owner', id: 3, segment: 'owner-profiles' });
    expect(profilDesPieces('agent:9')).toEqual({ type: 'agent', id: 9, segment: 'agent-profiles' });
    expect(profilDesPieces('service_provider:1')).toEqual({ type: 'service_provider', id: 1, segment: 'profiles' });
    for (const autre of [null, 'agency_admin:2', 'owner:abc', 'owner']) expect(profilDesPieces(autre)).toBeNull();
  });

  it('ce que « Envoyer mes pièces » envoie : les seules pièces préparées, dans l’ordre de l’écran', () => {
    const f = new File(['x'], 'a.pdf');
    expect(envoisAFaire([p('cni', 'missing'), p('rib', 'missing'), p('ninea', 'missing')], { ninea: { numero: '01234567G2' }, cni: { fichier: f } })).toEqual([
      { code: 'cni', prepare: { fichier: f } },
      { code: 'ninea', prepare: { numero: '01234567G2' } },
    ]);
  });
});
