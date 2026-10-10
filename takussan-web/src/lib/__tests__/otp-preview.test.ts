import { describe, expect, it } from 'vitest';

import { codeApercu } from '@/lib/otp-preview';

describe('codeApercu (TCK-620, ADR-0060)', () => {
  it('lit le code à 6 chiffres rendu hors production', () => {
    expect(codeApercu({ otp_preview: '048213', data: { sent: true } })).toBe('048213');
  });

  it('ne rend rien sans la clé — le cas de la production', () => {
    expect(codeApercu({ data: { sent: true } })).toBeNull();
    expect(codeApercu(undefined)).toBeNull();
    expect(codeApercu('texte')).toBeNull();
  });

  it('ignore une valeur qui n’est pas un code', () => {
    expect(codeApercu({ otp_preview: 123456 })).toBeNull();
    expect(codeApercu({ otp_preview: '12345' })).toBeNull();
    expect(codeApercu({ otp_preview: '<b>1</b>' })).toBeNull();
  });
});
