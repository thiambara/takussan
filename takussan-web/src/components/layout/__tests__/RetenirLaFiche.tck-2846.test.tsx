/**
 * TCK-2846 — `RetenirLaFiche` : monté par une fiche, il la retient dans les récents de l'espace de la
 * coque ; hors de la coque, rien. `OublierLaFiche` (panneau « accès refusé ») la retire.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

import { ContexteDuMenuDeLaCoque } from '../contexte-du-menu-de-la-coque';
import { OublierLaFiche, RetenirLaFiche } from '../RetenirLaFiche';
import { clePagesRecentes, lirePagesRecentes } from '@/lib/navigation/pages-recentes';
import type { User } from '@/types/user';

const ESPACE = 'agent:3';
const user = { id: 7, roles: ['customer', 'agent'] } as unknown as User;
const dansLaCoque = (enfant: ReactNode) => (
  <ContexteDuMenuDeLaCoque.Provider value={{ user, modulesMasques: [], espaceActif: ESPACE }}>{enfant}</ContexteDuMenuDeLaCoque.Provider>
);

beforeEach(() => window.localStorage.clear());

describe('TCK-2846 — RetenirLaFiche', () => {
  it('retient la fiche dans l’espace de la coque, sous son titre', () => {
    render(dansLaCoque(<RetenirLaFiche type="bien" id={42} titre="Villa 4 chambres à Ngor" chemin="/app/properties/42" />));
    expect(lirePagesRecentes(7, ESPACE)).toEqual([{ chemin: '/app/properties/42', type: 'bien', id: '42', titre: 'Villa 4 chambres à Ngor' }]);
  });

  it('hors de la coque : rien n’est écrit', () => {
    render(<RetenirLaFiche type="bien" id={42} titre="Villa" chemin="/app/properties/42" />);
    expect(window.localStorage.getItem(clePagesRecentes(7))).toBeNull();
  });

  it('AC5 — un client sans nom (titre = son courriel ou son numéro) n’est pas retenu', () => {
    render(dansLaCoque(<RetenirLaFiche type="client" id={5} titre="awa@example.sn" chemin="/app/customers/5" />));
    render(dansLaCoque(<RetenirLaFiche type="client" id={6} titre="+221 77 000 06 22" chemin="/app/customers/6" />));
    expect(window.localStorage.getItem(clePagesRecentes(7))).toBeNull();
  });

  it('OublierLaFiche retire la fiche refusée', () => {
    const { unmount } = render(dansLaCoque(<RetenirLaFiche type="client" id={5} titre="Awa Ndiaye" chemin="/app/customers/5" />));
    unmount();
    render(dansLaCoque(<OublierLaFiche chemin="/app/customers/5" />));
    expect(lirePagesRecentes(7, ESPACE)).toEqual([]);
  });
});
