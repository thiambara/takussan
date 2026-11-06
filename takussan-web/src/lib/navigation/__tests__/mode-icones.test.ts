import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLAGE_ICONES_AUTO, cookieDuModeIcones, modeIconesDepuisCookie } from '../mode-icones';

describe('le mode icônes de l’appareil (TCK-2480, A10)', () => {
  it('sans cookie, `auto` ; `1` et `0` sont des choix explicites ; le reste vaut `auto`', () => {
    expect(modeIconesDepuisCookie(undefined)).toBe('auto');
    expect(modeIconesDepuisCookie('1')).toBe('icones');
    expect(modeIconesDepuisCookie('0')).toBe('complet');
    expect(modeIconesDepuisCookie('oui')).toBe('auto');
  });

  it('le cookie : `/app`, un an, `SameSite=Lax`, `Secure` en https ; `auto` l’efface', () => {
    expect(cookieDuModeIcones('icones', true)).toBe('menu_icones=1; path=/app; max-age=31536000; samesite=lax; secure');
    expect(cookieDuModeIcones('complet', false)).toBe('menu_icones=0; path=/app; max-age=31536000; samesite=lax');
    expect(cookieDuModeIcones('auto', false)).toContain('max-age=0');
  });

  it('la plage `auto` des infobulles est, au caractère près, celle de la variante CSS `icones:`', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app', 'globals.css'), 'utf8');
    const variante = /@custom-variant icones \{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';
    expect(variante).toContain('[data-menu="icones"]');
    expect(variante).toContain(`@media ${PLAGE_ICONES_AUTO}`);
    expect(variante).toContain('[data-menu="auto"]');
  });
});
