/**
 * TCK-633 (AC2) — la modale de suppression promettait une restauration « depuis l'administration ».
 * Aucune route ni aucun écran ne restaure un bien supprimé (D2 : la corbeille est hors périmètre).
 *
 * Éprouvé là où l'utilisateur le lit : la modale OUVERTE, depuis les deux menus, dans les trois
 * langues — une clé corrigée en français seulement resterait fausse en anglais et en wolof.
 * La console super-admin a sa propre modale, gardée de même :
 * `src/components/admin/super/__tests__/SuperAdminPropertiesTable.suppression.test.tsx`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { PropertyDetail, PropertyListItem } from '@/types/property';
import { PropertyHeaderActions } from '../PropertyHeaderActions';
import { PropertyRowActions } from '../PropertyRowActions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
}));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));
// Le membre tient `properties.delete` : le cloisonnement a son propre fichier (TCK-587).
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

const DICTIONNAIRES = { fr, en, wo } as const;

/** Les libellés tels que l'écran les rend : `fr` sert de repli sous les autres (`src/test/intl.tsx`). */
const libelles = (locale: LocaleDeTest) => ({
  ...fr.property.dashboard.actions,
  ...DICTIONNAIRES[locale].property.dashboard.actions,
});

const BIEN = { id: 47, title: 'Studio à Ouakam', slug: 'studio-ouakam', status: 'available', visibility: 'public' } as const;

/**
 * Le texte EXACT que la modale doit dire, clé interpolée, écrit ici en clair et non relu du
 * dictionnaire. Une liste de motifs interdits laisse passer toute promesse qu'elle n'a pas
 * prévue (« An administrator can bring it back later. » passait) ; une égalité stricte refuse
 * tout ajout, quelle qu'en soit la forme. Changer ce texte, c'est changer ce tableau — en le
 * relisant pour ce qu'il promet.
 */
const ATTENDU = {
  'ligne de la liste': {
    fr: 'Le bien Studio à Ouakam sera supprimé et retiré du site. Cette action est irréversible.',
    en: 'The property Studio à Ouakam will be deleted and taken off the site. This action cannot be undone.',
    wo: 'Kër gi Studio à Ouakam dañu koy far, te du feeñati ci sit bi. Jëf bii mënatul dellu.',
  },
  'en-tête de la fiche': {
    fr: 'Le bien Studio à Ouakam sera supprimé de votre portefeuille et retiré du site. Cette action est irréversible.',
    en: 'The property Studio à Ouakam will be removed from your portfolio and taken off the site. This action cannot be undone.',
    wo: 'Kër gi Studio à Ouakam dañu koy dindi ci sa portfey, te du feeñati ci sit bi. Jëf bii mënatul dellu.',
  },
} as const;

const MENUS = {
  'ligne de la liste': () => <PropertyRowActions property={BIEN as unknown as PropertyListItem} />,
  'en-tête de la fiche': () => <PropertyHeaderActions property={BIEN as unknown as PropertyDetail} />,
};

describe.each(Object.entries(MENUS) as [keyof typeof MENUS, () => React.ReactElement][])(
  'supprimer depuis « %s » (TCK-633, AC2)',
  (nom, menu) => {
    it.each(['fr', 'en', 'wo'] as const)(
      'en %s, la modale dit exactement que le bien sera supprimé, sans retour possible',
      async (locale) => {
        const user = userEvent.setup();
        const a = libelles(locale);
        render(withIntl(menu(), locale));

        await user.click(screen.getByRole('button', {
          // L'en-tête dit « Plus d'actions » ; la ligne de liste y ajoute le bien (TCK-1035).
          name: (nom) => nom === a.more || nom === a.moreFor.replace('{title}', BIEN.title),
        }));
        await user.click(await screen.findByRole('menuitem', { name: a.delete }));
        const dialogue = await screen.findByRole('dialog', { name: a.deleteTitle });

        expect(dialogue).toHaveAccessibleDescription(ATTENDU[nom][locale]);
      },
    );
  },
);
