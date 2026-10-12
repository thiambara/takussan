import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';

/**
 * Le tiroir des filtres sous `lg` est une vraie modale (relecture adverse de la revue design du
 * 2026-09-16) : il se déclarait `aria-modal` mais laissait le focus sur `body`, si bien qu'Échap
 * ne fermait rien. Le test porte sur ce que l'utilisateur au clavier observe : où est le focus,
 * et ce que fait Échap émis sur `document` — pas sur le tiroir, où rien ne l'aurait reçu.
 */
function Banc() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir les filtres
      </button>
      <FilterSidebar
        filters={{}}
        onFilterChange={() => {}}
        onReset={() => {}}
        activeCount={0}
        open={open}
        onClose={() => setOpen(false)}
        debounceMs={20}
      />
    </>
  );
}

describe('FilterSidebar — le tiroir mobile tient le focus', () => {
  it('prend le focus à l’ouverture, se ferme sur Échap et rend le focus au déclencheur', () => {
    render(withIntl(<Banc />));
    const declencheur = screen.getByRole('button', { name: 'Ouvrir les filtres' });
    declencheur.focus();
    fireEvent.click(declencheur);

    const tiroir = screen.getByRole('dialog');
    expect(tiroir.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(declencheur);
  });

  it('fait tourner Tab dans le tiroir', () => {
    render(withIntl(<Banc />));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les filtres' }));
    const tiroir = screen.getByRole('dialog');
    const cibles = tiroir.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
    const dernier = cibles[cibles.length - 1];

    dernier.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(tiroir.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(dernier);

    (tiroir as HTMLElement).focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(tiroir.contains(document.activeElement)).toBe(true);
  });
});

// Retour du porteur du 2026-10-10 (390 px) : l'en-tête du tiroir défilait avec les filtres, et
// « Tout effacer » comme la croix sortaient de l'écran. Il est posé AU-DESSUS de la zone qui défile.
describe('FilterSidebar — l’en-tête du tiroir ne défile pas', () => {
  it('titre et fermeture hors de la zone qui défile, les sections dedans', () => {
    render(withIntl(<Banc />));
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les filtres' }));
    const tiroir = screen.getByRole('dialog');
    const defilement = tiroir.querySelector<HTMLElement>('[data-defilement="tiroir"]')!;

    expect(defilement.className.split(/\s+/)).toContain('overflow-y-auto');
    // `within` : la barre latérale du bureau est aussi montée (masquée par CSS, que jsdom ignore).
    const dansLeTiroir = within(tiroir);
    const titre = dansLeTiroir.getByRole('heading', { level: 2, name: 'Filtres' });
    expect(defilement.contains(titre)).toBe(false);
    expect(defilement.contains(dansLeTiroir.getByRole('button', { name: 'Fermer les filtres' }))).toBe(false);
    expect(defilement.contains(dansLeTiroir.getByText('Type de transaction'))).toBe(true);
  });
});
