import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import { fieldDensityScope } from '@/components/ui/field-density';
import type { PropertyFormValues } from '@/lib/schemas/property';
import type { PropertyDetail } from '@/types/property';

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));
const geo = vi.hoisted(() => ({
  valeur: { suggestion: null as { city: string; region: string } | null, defaults: {}, loading: false },
}));
vi.mock('@/hooks/useGeoSuggestion', () => ({ useGeoSuggestion: () => geo.valeur }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  updatePropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  createPropertyAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
// Sans ces deux-là, `PropertyWizard` rend son état de chargement et pas son `<form>` — la garde
// mesurerait alors un arbre vide en croyant mesurer le parcours.
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: null, loading: false }),
}));
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    isLoading: false, isSaving: false, error: null, draft: null,
    save: vi.fn(), flush: vi.fn(), clear: vi.fn(),
  }),
}));

import { PropertyForm } from '../PropertyForm';
import { PropertyWizard } from '../PropertyWizard';
import { StepBien } from '../wizard/steps/StepBien';
import { StepLieu } from '../wizard/steps/StepLieu';
import { StepCaracteristiques } from '../wizard/steps/StepCaracteristiques';
import { StepPrix } from '../wizard/steps/StepPrix';
import { StepFinition } from '../wizard/steps/StepFinition';
import { StepPhotos } from '../wizard/steps/StepPhotos';

/**
 * TCK-468 — LA GARDE. Ce fichier existe pour un défaut précis : agrandir les champs d'aujourd'hui
 * ne dit rien de celui qu'on ajoutera demain. Une prop `size="lg"` s'oublie en silence ; la
 * portée `data-field-density` ne s'oublie que d'une seule manière — écrire une hauteur en dur, ou
 * monter un champ à la main plutôt que par la primitive. C'est ce cas-là que ce fichier refuse.
 *
 * ⚠ Le piège que ces tests évitent délibérément : « champs et pastilles sont COHÉRENTS » se
 * coche aussi en RAPETISSANT les pastilles. On assert donc la hauteur attendue des DEUX côtés
 * (44 px), jamais leur égalité.
 *
 * ⚠ jsdom ne calcule aucune hauteur et ne charge aucun CSS : la classe est le seul témoin
 * disponible ici. Que ces classes valent bien 44 px, et l'emportent sur la hauteur de base, est
 * prouvé ailleurs, sur le CSS réellement compilé — `ui/__tests__/field-density.test.tsx`.
 */

/** 44 px ou plus, sans condition. `min-h-16` = 64 px : le `Textarea` est déjà au-dessus. */
const HAUTEURS_SUFFISANTES = ['h-11', 'h-12', 'h-14', 'min-h-11', 'min-h-12', 'min-h-14', 'min-h-16'];
const CLASSES_DE_DENSITE = [
  'in-data-[field-density=comfortable]:h-11',
  'in-data-[field-density=comfortable]:data-[size=default]:h-11',
];

/**
 * Tout ce qu'un doigt vise dans un formulaire. Trois exclusions, chacune motivée :
 * - `type="hidden"` — `DatePicker` en pose un pour la sérialisation native, il n'a pas de boîte ;
 * - `type="file"` — celui de `MediaDropzone` est masqué derrière une zone de dépôt bien plus
 *   grande que 44 px, c'est elle la cible ;
 * - `type="checkbox"` — la case fait 16 px mais elle est ENVELOPPÉE d'un `<label>` cliquable qui
 *   porte le libellé ; sa cible réelle est la ligne. C'est un régime à part, hors périmètre de
 *   TCK-468 — et le dire ici vaut mieux que de l'omettre en silence.
 */
const SELECTEUR_CHAMPS = [
  // `:not([aria-hidden="true"])` retire l'input de sérialisation que `@base-ui/react` pose sous
  // chaque `Select` (1×1 px, `tabindex="-1"`, hors arbre d'accessibilité) : ce n'est pas une
  // cible, c'est de la plomberie de formulaire.
  'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([aria-hidden="true"])',
  'textarea',
  '[data-slot="select-trigger"]',
  '[data-slot="date-picker-trigger"]',
  '[data-slot="date-time-picker-trigger"]',
].join(', ');

function estConfortable(el: Element): boolean {
  const classes = el.className.toString();
  if (HAUTEURS_SUFFISANTES.some((c) => new RegExp(`(^|\\s)${c.replace('[', '\\[')}(\\s|$)`).test(classes))) {
    return true;
  }
  // Sinon : la classe de densité ET une portée qui la déclare. L'une sans l'autre ne suffit pas —
  // c'est exactement l'erreur qu'on veut voir rougir.
  return (
    CLASSES_DE_DENSITE.some((c) => classes.includes(c)) &&
    el.closest('[data-field-density="comfortable"]') !== null
  );
}

function exigeCiblesConfortables(racine: HTMLElement, ecran: string): void {
  const champs = Array.from(racine.querySelectorAll(SELECTEUR_CHAMPS));
  expect(champs.length, `${ecran} : aucun champ trouvé — le sélecteur ne mesure plus rien`)
    .toBeGreaterThan(0);
  const fautifs = champs
    .filter((el) => !estConfortable(el))
    .map((el) => `${el.tagName.toLowerCase()}#${el.id || '(sans id)'} → "${el.className}"`);
  expect(fautifs, `${ecran} : champ(s) hors du régime 44 px`).toEqual([]);
}

function exigePastilles44(racine: HTMLElement, ecran: string): void {
  const pastilles = Array.from(racine.querySelectorAll('button')).filter((b) =>
    b.className.includes('rounded-full'),
  );
  expect(pastilles.length, `${ecran} : aucune pastille trouvée`).toBeGreaterThan(0);
  for (const p of pastilles) {
    expect(p.className, `${ecran} : pastille sous 44 px — "${p.textContent}"`).toContain('min-h-11');
  }
}

function harnais(
  defauts: Partial<PropertyFormValues>,
  rendu: (form: UseFormReturn<PropertyFormValues>) => React.ReactNode,
) {
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '', type: 'apartment', contract_type: 'rent', currency: 'XOF',
        city: '', furnished: false, tag_ids: [], ...defauts,
      } as PropertyFormValues,
    });
    // La portée réelle est posée par `PropertyWizard` sur son `<form>` (vérifié séparément
    // ci-dessous) ; ici on la reproduit à l'identique pour éprouver CHAQUE étape.
    return <form {...fieldDensityScope()}>{rendu(form)}</form>;
  }
  return render(withIntl(<Harnais />));
}

function maison(patch: Record<string, unknown> = {}): PropertyDetail {
  return {
    id: 7, title: 'Villa Almadies', type: 'house', contract_type: 'sale',
    price: 85_000_000, currency: 'XOF', location: { city: 'Dakar' }, tags: [], ...patch,
  } as never;
}

// ── La portée est bien ouverte, et sur le bon élément ────────────────────────

describe('la portée de densité est ouverte par les deux écrans', () => {
  it('publication — `PropertyWizard` la pose sur son `<form>`, sans nœud intercalé', () => {
    const { container } = render(withIntl(<PropertyWizard tags={[]} />));
    const formulaire = container.querySelector('form');
    expect(formulaire).not.toBeNull();
    expect(formulaire).toHaveAttribute('data-field-density', 'comfortable');
    // Le `<form>` porte AUSSI la chaîne de hauteur de l'AC9 de TCK-464 : l'attribut a été
    // spreadé dessus, pas enveloppé dans un `<div>` qui l'aurait rompue.
    expect(formulaire!.className).toContain('h-full');
    expect(formulaire!.className).toContain('min-h-0');
  });

  it('édition — `PropertyForm` la pose sur son `<form>`', () => {
    const { container } = render(withIntl(<PropertyForm mode="edit" property={maison()} />));
    expect(container.querySelector('form')).toHaveAttribute('data-field-density', 'comfortable');
  });
});

// ── AC1 : aucun champ du parcours n'échappe au régime ────────────────────────

describe('AC1 — publication : tous les champs sont à 44 px, et les pastilles aussi', () => {
  it('étape Bien — les pastilles (44 px) sont le témoin de référence', () => {
    const { container } = harnais({}, (form) => <StepBien form={form} />);
    exigePastilles44(container, 'StepBien');
  });

  it('étape Lieu — champs texte, y compris ceux du repli « détails »', async () => {
    const { container } = harnais({}, (form) => <StepLieu form={form} />);
    // Le repli contient trois champs de plus : les ouvrir, sinon la garde ne les voit pas.
    fireEvent.click(screen.getByRole('button', { name: /rue et le code postal/i }));
    exigeCiblesConfortables(container, 'StepLieu');
  });

  it('étape Caractéristiques — champs numériques ET pastilles d’équipements', () => {
    const { container } = harnais(
      { type: 'apartment', contract_type: 'rent' },
      (form) => (
        <StepCaracteristiques
          form={form}
          tags={[{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' } as never]}
        />
      ),
    );
    exigeCiblesConfortables(container, 'StepCaracteristiques');
    exigePastilles44(container, 'StepCaracteristiques');
  });

  it('étape Prix — c’est ici que vit le `FormDatePicker`, le champ qu’aucune reprise locale n’atteignait', () => {
    const { container } = harnais({ contract_type: 'rent' }, (form) => <StepPrix form={form} />);
    expect(container.querySelector('[data-slot="date-picker-trigger"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="select-trigger"]')).not.toBeNull();
    exigeCiblesConfortables(container, 'StepPrix');
  });

  it('étape Finition — champ texte et zone de texte', () => {
    const { container } = harnais({}, (form) => <StepFinition form={form} />);
    exigeCiblesConfortables(container, 'StepFinition');
  });

  it('étape Photos — aucun champ de saisie, et c’est vérifié plutôt que supposé', () => {
    const { container } = harnais({}, () => (
      <StepPhotos files={[]} onChange={() => {}} onRemove={() => {}} error={null} />
    ));
    expect(container.querySelectorAll(SELECTEUR_CHAMPS)).toHaveLength(0);
  });
});

describe('AC1 — édition : le même régime, des deux côtés', () => {
  it('les champs sont à 44 px', () => {
    const { container } = render(withIntl(<PropertyForm mode="edit" property={maison()} />));
    exigeCiblesConfortables(container, 'PropertyForm');
  });

  it('les pastilles d’équipements aussi — l’écart ne change pas de camp', () => {
    const { container } = render(
      withIntl(
        <PropertyForm
          mode="edit"
          property={maison()}
          tags={[{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' } as never]}
        />,
      ),
    );
    exigePastilles44(container, 'PropertyForm');
  });
});

// ── Ce que la garde refuse ───────────────────────────────────────────────────

describe('la garde refuse ce qu’elle doit refuser', () => {
  it('un champ monté à la main avec une hauteur en dur est REJETÉ', () => {
    const { container } = render(
      <form {...fieldDensityScope()}>
        <input id="ajoute-demain" className="h-8 w-full rounded-lg border" />
      </form>,
    );
    expect(() => exigeCiblesConfortables(container, 'cas-limite')).toThrow(/hors du régime 44 px/);
  });

  it('un champ correct mais SORTI de la portée est REJETÉ', () => {
    const { container } = render(
      <form>
        <input
          id="hors-portee"
          className="h-8 in-data-[field-density=comfortable]:h-11"
        />
      </form>,
    );
    expect(() => exigeCiblesConfortables(container, 'cas-limite')).toThrow(/hors du régime 44 px/);
  });
});
