/**
 * TCK-590 AC21 — le texte partagé dit ce qu'est le bien, dans la langue du visiteur, prix en
 * F CFA, et chaque canal signe son lien de sa source.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { PropertyShareDialog } from '../PropertyShareDialog';
import { retenirArrivee, arrivee } from '@/lib/attribution';

const BIEN = {
  type: 'apartment' as const,
  price: 350_000,
  currency: 'XOF',
  location: {
    full: 'Almadies, Dakar',
    street: null,
    quarter: 'Almadies',
    city: 'Dakar',
    region: null,
    country: null,
    postal_code: null,
    latitude: null,
    longitude: null,
  },
};

const URL_FICHE = 'https://www.takussan.com/en/properties/appartement-almadies';

function texteWhatsApp(): string {
  const href = screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href') ?? '';
  return decodeURIComponent(href.split('?text=')[1] ?? '');
}

describe('<PropertyShareDialog> — TCK-590 AC21', () => {
  it('en anglais : type, prix en F CFA, quartier, lien signé whatsapp/share', () => {
    render(withIntl(<PropertyShareDialog open onOpenChange={() => {}} property={BIEN} url={URL_FICHE} />, 'en'));

    const texte = texteWhatsApp();
    expect(texte).toContain('Apartment');
    expect(texte.replace(/[\u202f\u00a0]/g, ' ')).toContain('350 000 F CFA');
    expect(texte).toContain('Almadies');
    expect(texte).toContain(`${URL_FICHE}?utm_source=whatsapp&utm_medium=share`);
    expect(texte).not.toMatch(/€|\$|EUR|USD/);
  });

  it('chaque canal signe son propre lien ; le lien affiché, lui, reste la fiche nue', () => {
    render(withIntl(<PropertyShareDialog open onOpenChange={() => {}} property={BIEN} url={URL_FICHE} />, 'en'));

    const facebook = screen.getByRole('link', { name: 'Facebook' }).getAttribute('href') ?? '';
    expect(decodeURIComponent(facebook)).toContain('utm_source=facebook&utm_medium=share');
    expect(screen.getByRole('textbox')).toHaveValue(URL_FICHE);
  });

  it('arrivé par ce lien, le visiteur porte la source whatsapp / share', () => {
    window.sessionStorage.clear();
    retenirArrivee('?utm_source=whatsapp&utm_medium=share');
    expect(arrivee()).toEqual({ source: 'whatsapp', medium: 'share' });

    // Une valeur hors de la forme que l'API accepte est écartée plutôt que de faire échouer l'envoi.
    window.sessionStorage.clear();
    retenirArrivee('?utm_source=%3Cscript%3E&utm_medium=share');
    expect(arrivee()).toEqual({});
  });
});
