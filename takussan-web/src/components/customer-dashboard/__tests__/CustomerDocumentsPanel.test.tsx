/**
 * TCK-700 (P13.04) — l'onglet Documents de la fiche client dépose par `POST /api/documents`.
 *
 * Le panneau postait le fichier sur `/api/customers/{id}/documents`, qu'aucune route de l'API ne
 * sert : le dépôt échouait toujours. La même fiche offre `AddDocumentButton`, qui passe par
 * `POST /api/documents` avec `documentable_type=customer` et écrit la relation que le panneau
 * liste. Ces tests gardent les deux faces : le panneau monte ce bouton pour la fiche, et plus
 * aucun code du front ne vise la route absente.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { withIntl } from '@/test/intl';
import { CustomerDocumentsPanel } from '../CustomerDocumentsPanel';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

vi.mock('@/app/actions/dashboard-customers', () => ({
  uploadCustomerDocumentAction: vi.fn(),
}));

type Props = { documentableType: string; documentableId: number; onUploaded?: () => void };
const recus: Props[] = [];
vi.mock('@/components/documents/AddDocumentButton', () => ({
  AddDocumentButton: (props: Props) => {
    recus.push(props);
    return <button type="button">ajouter</button>;
  },
}));

describe('<CustomerDocumentsPanel> — dépôt par POST /api/documents (TCK-700)', () => {
  it('monte AddDocumentButton pour la fiche, et rafraîchit la liste après un dépôt', () => {
    recus.length = 0;
    const { container } = render(
      withIntl(<CustomerDocumentsPanel customerId={42} documents={[]} />),
    );

    expect(screen.getByRole('button', { name: 'ajouter' })).toBeTruthy();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    const props = recus.at(-1);
    expect(props?.documentableType).toBe('customer');
    expect(props?.documentableId).toBe(42);

    props?.onUploaded?.();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('aucun fichier de src/ ne poste sur /customers/{id}/documents', () => {
    const racine = path.resolve(__dirname, '../../..');
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') parcourir(chemin);
        } else if (/\.tsx?$/.test(e.name)) {
          if (/customers\/\$\{[^}]+\}\/documents/.test(fs.readFileSync(chemin, 'utf8'))) {
            fautifs.push(path.relative(racine, chemin));
          }
        }
      }
    };
    parcourir(racine);

    expect(fautifs).toEqual([]);
  });
});
