import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { withIntl } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));

const geo = vi.hoisted(() => ({
  valeur: { suggestion: null as { city: string; region: string } | null, defaults: {}, loading: false },
}));
vi.mock('@/hooks/useGeoSuggestion', () => ({ useGeoSuggestion: () => geo.valeur }));

import { StepLieu } from '../wizard/steps/StepLieu';
import { StepPrix } from '../wizard/steps/StepPrix';
import { StepFinition } from '../wizard/steps/StepFinition';
import { StepPhotos } from '../wizard/steps/StepPhotos';

/**
 * TCK-464 — les étapes dont la logique ne tient pas dans un rendu conditionnel : le prix (le
 * bloc de location existe mais sort de l'arbre d'accessibilité en vente), la finition (le titre
 * se propose une fois, et jamais par-dessus une saisie) et le lieu (la suggestion s'accepte, elle
 * ne se pose pas).
 */
function harnais(
  defauts: Partial<PropertyFormValues>,
  rendu: (form: UseFormReturn<PropertyFormValues>) => React.ReactNode,
) {
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: {
        title: '',
        type: 'apartment',
        contract_type: 'rent',
        currency: 'XOF',
        city: '',
        furnished: false,
        tag_ids: [],
        ...defauts,
      } as PropertyFormValues,
    });
    return <>{rendu(form)}</>;
  }
  return render(withIntl(<Harnais />));
}

describe('StepPrix', () => {
  it('demande la fréquence ET la disponibilité en LOCATION, et elles sont ATTEIGNABLES', () => {
    harnais({ contract_type: 'rent' }, (form) => <StepPrix form={form} />);

    const bloc = screen.getByTestId('bloc-location');
    expect(bloc).not.toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText(/^prix/i)).toBeInTheDocument();
    // `getByRole` exclut par défaut ce qui est `aria-hidden` : un `StepPrix` qui rendrait un
    // `bloc-location` vide (mais sans `aria-hidden`) passerait un test qui ne vérifierait que
    // l'attribut du conteneur — c'est exactement le défaut que ce test corrige.
    expect(screen.getByRole('combobox', { name: /fréquence/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disponible/i })).toBeInTheDocument();
  });

  it('sort le bloc de location de l’arbre d’accessibilité en VENTE — fréquence et disponibilité EN SONT RETIRÉES', () => {
    harnais({ contract_type: 'sale' }, (form) => <StepPrix form={form} />);

    // Le bloc reste dans le DOM pour que la transition de hauteur existe — mais un lecteur
    // d'écran ne doit pas annoncer deux champs invisibles, et `getByRole` s'en assure : un rôle
    // porté par un ancêtre `aria-hidden` n'est PAS résolu, contrairement à `getByLabelText`.
    expect(screen.getByTestId('bloc-location')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('combobox', { name: /fréquence/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disponible/i })).not.toBeInTheDocument();
  });

  it('demande toujours le prix et la devise, quel que soit le contrat', () => {
    harnais({ contract_type: 'sale' }, (form) => <StepPrix form={form} />);

    expect(screen.getByLabelText(/^prix/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/devise/i)).toBeInTheDocument();
  });
});

describe('StepFinition', () => {
  it('propose un titre composé de ce que le parcours sait déjà', async () => {
    harnais(
      { type: 'villa', bedrooms: 4, quarter: 'Almadies', city: 'Dakar' },
      (form) => <StepFinition form={form} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/titre/i)).toHaveValue('Villa 4 chambres à Almadies');
    });
  });

  it('n’écrase JAMAIS un titre déjà saisi', async () => {
    harnais(
      { title: 'Ma villa de rêve', type: 'villa', bedrooms: 4, city: 'Dakar' },
      (form) => <StepFinition form={form} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/titre/i)).toHaveValue('Ma villa de rêve');
    });
  });

  it('compte les caractères de la description', async () => {
    const user = userEvent.setup();
    harnais({ type: 'villa' }, (form) => <StepFinition form={form} />);

    await user.type(screen.getByLabelText(/description/i), 'Belle vue');
    expect(screen.getByText(/9\s+caractères/)).toBeInTheDocument();
  });
});

describe('StepLieu', () => {
  it('AC6 — laisse la ville VIDE tant que la suggestion n’est pas acceptée', () => {
    geo.valeur = { suggestion: { city: 'Dakar', region: 'Dakar' }, defaults: {}, loading: false };
    harnais({}, (form) => <StepLieu form={form} />);

    expect(screen.getByLabelText(/ville/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /dakar/i })).toBeInTheDocument();
    // Assertion POSITIVE sur le `data-testid` lui-même : sans elle, un renommage de
    // `geo-suggestion` dans `GeoSuggestionChip.tsx` ne serait jamais attrapé par le test qui ne
    // l'emploie qu'en négatif (« ne propose rien… », plus bas).
    expect(screen.getByTestId('geo-suggestion')).toBeInTheDocument();
  });

  it('AC6 — remplit ville ET région une fois la suggestion acceptée, puis se retire', async () => {
    const user = userEvent.setup();
    geo.valeur = { suggestion: { city: 'Saly', region: 'Thiès' }, defaults: {}, loading: false };
    harnais({}, (form) => <StepLieu form={form} />);

    await user.click(screen.getByRole('button', { name: /saly/i }));

    expect(screen.getByLabelText(/ville/i)).toHaveValue('Saly');
    expect(screen.getByLabelText(/région/i)).toHaveValue('Thiès');
    expect(screen.queryByRole('button', { name: /saly/i })).not.toBeInTheDocument();
  });

  it('n’EFFACE pas une région déjà saisie quand la géo-IP ne la connaît pas', async () => {
    const user = userEvent.setup();
    geo.valeur = { suggestion: { city: 'Dakar', region: '' }, defaults: {}, loading: false };
    // Le cas qui coûte : `useGeoSuggestion` rend `region: ''`, et l'écrire tel quel effacerait une
    // correction que l'utilisateur venait de saisir. Une région vide n'est pas une région, c'est
    // l'absence de suggestion — et une absence ne s'écrit pas.
    harnais({ region: 'Thiès' }, (form) => <StepLieu form={form} />);

    await user.click(screen.getByRole('button', { name: /dakar/i }));

    expect(screen.getByLabelText(/ville/i)).toHaveValue('Dakar');
    expect(screen.getByLabelText(/région/i)).toHaveValue('Thiès');
  });

  it('AC6 — le flash marque les champs RÉELLEMENT remplis, et eux seuls', async () => {
    const user = userEvent.setup();
    geo.valeur = { suggestion: { city: 'Dakar', region: '' }, defaults: {}, loading: false };
    harnais({}, (form) => <StepLieu form={form} />);

    await user.click(screen.getByRole('button', { name: /dakar/i }));

    // `wizard-flash` (globals.css) est le seul signal visuel que la suggestion a écrit ici. Le
    // poser sur la région, que la géo-IP ne connaissait pas, annoncerait une écriture qui n'a pas
    // eu lieu — et l'utilisateur irait vérifier un champ intact.
    //
    // ⚠ M-8 — `conteneur` LÈVE plutôt que de rendre `undefined` si la chaîne DOM casse (structure
    // interne de `FormInput` modifiée). Un `?? ''` masquait ce cas : `''.not.toContain(...)`
    // passerait toujours, silencieusement, même si l'assertion ne portait plus rien.
    function conteneur(nom: RegExp): HTMLElement {
      const label = screen.getByLabelText(nom);
      const enveloppe = label.closest('div')?.parentElement;
      if (!(enveloppe instanceof HTMLElement)) {
        throw new Error(`conteneur(${nom}) — chaîne DOM inattendue, structure de FormInput modifiée ?`);
      }
      return enveloppe;
    }
    expect(conteneur(/ville/i).className).toContain('wizard-flash');
    expect(conteneur(/région/i).className).not.toContain('wizard-flash');
  });

  it('ne propose rien quand la géo-IP n’a pas de ville', () => {
    geo.valeur = { suggestion: null, defaults: {}, loading: false };
    harnais({}, (form) => <StepLieu form={form} />);

    expect(screen.getByLabelText(/ville/i)).toHaveValue('');
    expect(screen.queryByTestId('geo-suggestion')).not.toBeInTheDocument();
  });

  it('replie les détails d’adresse par défaut, et les déplie sur demande', async () => {
    const user = userEvent.setup();
    geo.valeur = { suggestion: null, defaults: {}, loading: false };
    harnais({}, (form) => <StepLieu form={form} />);

    const bascule = screen.getByRole('button', { expanded: false });
    expect(screen.getByTestId('details-adresse')).toHaveAttribute('aria-hidden', 'true');

    await user.click(bascule);
    expect(screen.getByTestId('details-adresse')).not.toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * I-5 — « Utiliser ma position » était muet pendant l'attente GPS (couramment plusieurs
   * secondes sur mobile) et restait en attente pour toujours en cas de refus, faute de callback
   * d'erreur. Même contrat d'injection que `AutourDeMoi` (`geolocalisation`), pour ne jamais
   * dépendre d'un `navigator.geolocation` que jsdom n'a pas.
   */
  it('« Utiliser ma position » se désactive et s’annonce occupé PENDANT l’acquisition', async () => {
    const user = userEvent.setup();
    geo.valeur = { suggestion: null, defaults: {}, loading: false };
    const jamaisResolue = { getCurrentPosition: vi.fn() }; // ne rappelle jamais : capture l'ATTENTE
    harnais({}, (form) => <StepLieu form={form} geolocalisation={jamaisResolue} />);

    const bouton = screen.getByTestId('bouton-position');
    expect(bouton).not.toBeDisabled();

    await user.click(bouton);

    expect(bouton).toBeDisabled();
    expect(screen.getByText(/localisation en cours/i)).toBeInTheDocument();
  });

  it('rend le REFUS de géolocalisation comme un état, et redonne la main au bouton', async () => {
    const user = userEvent.setup();
    geo.valeur = { suggestion: null, defaults: {}, loading: false };
    const refusee = {
      getCurrentPosition: vi.fn(
        (_ok: PositionCallback, ko?: PositionErrorCallback | null) =>
          ko?.({ code: 1, message: '' } as GeolocationPositionError),
      ),
    };
    harnais({}, (form) => <StepLieu form={form} geolocalisation={refusee} />);

    await user.click(screen.getByTestId('bouton-position'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/refusé/i);
    expect(screen.getByTestId('bouton-position')).not.toBeDisabled();
  });
});

describe('StepPhotos', () => {
  it('annonce le compte de photos et la limite', () => {
    render(
      withIntl(
        <StepPhotos
          files={[new File(['x'], 'a.jpg', { type: 'image/jpeg' })]}
          onChange={vi.fn()}
          onRemove={vi.fn()}
          error={null}
        />,
      ),
    );
    expect(screen.getByText(/1 photo sur 10/i)).toBeInTheDocument();
  });

  it('affiche l’erreur d’envoi comme une alerte', () => {
    render(
      withIntl(
        <StepPhotos files={[]} onChange={vi.fn()} onRemove={vi.fn()} error="Envoi impossible" />,
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Envoi impossible');
  });
});
