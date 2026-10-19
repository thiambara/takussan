import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { slugDuCatalogue } from '@/lib/libelle-equipement';
import { TAG_FIELDS } from '@/lib/queries/customers';
import { withIntl } from '@/test/intl';

import { CustomerListFilters } from '../CustomerListFilters';
import { CustomerTagChips, CustomerTagPicker } from '../CustomerTagPicker';

/**
 * TCK-922 (P30.06) — les étiquettes CRM du catalogue (`TagCatalog::CRM`) se traduisent par leur
 * slug, comme les équipements : même fonction (`libelleEquipement`), autre espace de clés
 * (`crm.tagCatalog`). Une étiquette saisie par l'agence s'affiche telle quelle.
 */
vi.mock('@/app/actions/dashboard-customers', () => ({
  attachCustomerTagsAction: vi.fn(),
  detachCustomerTagAction: vi.fn(),
}));
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const SOURCE = readFileSync(join(ROOT, 'takussan-api', 'app', 'Services', 'Tags', 'TagCatalog.php'), 'utf8');

function etiquettesDuCatalogue(): string[] {
  const bloc = /const CRM = \[([\s\S]*?)\];/.exec(SOURCE)?.[1] ?? '';
  return [...bloc.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
}

type Catalogue = Record<string, string>;
const lire = (messages: unknown): Catalogue | undefined =>
  (messages as { crm: { tagCatalog?: Catalogue } }).crm.tagCatalog;

const PROSPECT = { id: 2, name: 'Prospect chaud', slug: 'prospect-chaud', color: null };
const LIBRE = { id: 9, name: 'relance mardi', slug: 'relance-mardi-x8Kq', color: null };

describe('le catalogue CRM est traduit par slug (fr, en, wo)', () => {
  const noms = etiquettesDuCatalogue();

  it('le catalogue de l’API se lit', () => {
    expect(noms).toContain('Prospect chaud');
    expect(noms).toContain('Étudiant');
  });

  it.each([['fr', fr], ['en', en], ['wo', wo]] as const)('%s : chaque étiquette du catalogue a sa clé, et rien d’autre', (_, messages) => {
    expect(Object.keys(lire(messages) ?? {}).sort()).toEqual(noms.map(slugDuCatalogue).sort());
  });

  it('la liste des étiquettes demande le slug, sans quoi rien ne se traduit', () => {
    expect(TAG_FIELDS).toContain('slug');
  });
});

describe('les écrans CRM affichent l’étiquette du catalogue dans la langue de l’écran', () => {
  it('pastilles de la liste : traduites en anglais, le clic filtre toujours par le nom en base', () => {
    const surClic = vi.fn();
    render(withIntl(<CustomerTagChips tags={[PROSPECT, LIBRE]} onTagClick={surClic} />, 'en'));

    expect(screen.getByText('Hot lead')).toBeInTheDocument();
    expect(screen.queryByText('Prospect chaud')).not.toBeInTheDocument();
    expect(screen.getByText('relance mardi')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Hot lead'));
    expect(surClic).toHaveBeenCalledWith('Prospect chaud');
  });

  it('fiche client : la pastille et sa suggestion sont traduites', () => {
    render(withIntl(
      <CustomerTagPicker customerId={1} initialTags={[PROSPECT]} suggestions={[{ id: 3, name: 'Étudiant', slug: 'etudiant', color: null }]} />,
      'en',
    ));

    expect(screen.getByText('Hot lead')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'stud' } });
    expect(screen.getByText('Student')).toBeInTheDocument();
  });

  it('filtres de la liste : l’option est traduite, la valeur reste le nom en base', () => {
    mockReplace.mockReset();
    render(withIntl(<CustomerListFilters crmTags={[PROSPECT]} />, 'en'));

    fireEvent.click(screen.getByRole('button', { name: /tag/i }));
    fireEvent.click(screen.getByText('Hot lead'));
    expect(String(mockReplace.mock.calls.at(-1)?.[0])).toContain(encodeURIComponent('Prospect chaud').replace(/%20/g, '+'));
  });
});
