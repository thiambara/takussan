import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { Tag } from '@/types/tag';

/**
 * TCK-464 — l'assemblage : validation PAR ÉTAPE, brouillon, soumission en plusieurs écritures.
 *
 * Ce fichier n'éprouve QUE ce que l'assemblage décide. La pertinence des champs
 * (`field-matrix.test.ts`), la forme du corps de requête (`payload.test.ts`), la coquille
 * (`WizardShell.test.tsx`) et chaque étape (`wizard-steps.test.tsx`, `StepBien.test.tsx`,
 * `StepCaracteristiques.test.tsx`) ont les leurs. Ce qui n'appartient qu'ici : quelles clés on
 * déclenche à quel moment, ce qu'on écrit dans le brouillon, et ce que devient un bien créé dont
 * l'envoi des photos échoue.
 */

const routeur = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));

/**
 * On remplace le FOURNISSEUR de géolocalisation, pas `useGeoSuggestion` : c'est justement le
 * partage de `defaults` entre le hook et l'assemblage qui est en jeu ici (le pays et la devise
 * que la note de l'étape 1 promet). Mocker le hook rendrait le test vert sans que rien ne soit
 * posé.
 */
type Localisation = {
  city?: string;
  region?: string;
  country_code?: string;
  currency?: string;
} | null;

const geo = vi.hoisted(() => ({
  valeur: null as Localisation,
  loading: false,
}));
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: geo.valeur, loading: geo.loading }),
}));

const brouillon = vi.hoisted(() => ({
  etat: {
    isLoading: false,
    isSaving: false,
    error: null as Error | null,
    draft: null as { step: number; data: Record<string, unknown> | null } | null,
    save: vi.fn(),
    flush: vi.fn(),
    clear: vi.fn(),
  },
}));
vi.mock('@/hooks/useWizardDraft', () => ({ useWizardDraft: () => brouillon.etat }));

vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));

import {
  createPropertyAction,
  setPropertyTagsAction,
  uploadPropertyPhotosAction,
} from '@/app/actions/dashboard-properties';

import { PropertyWizard } from '../PropertyWizard';

function monter(tags: Tag[] = []) {
  return render(withIntl(<PropertyWizard tags={tags} />));
}

const WIFI: Tag = {
  id: 7, name: 'WiFi', slug: 'wifi', type: 'amenity', icon: null, color: null, description: null,
};

const suivant = () => screen.getByRole('button', { name: /^continuer$/i });
const typeBien = (nom: RegExp) => screen.getByRole('radio', { name: nom });

/** Étape 1 → étape 3 : le type, le contrat, la ville. Le chemin le plus court jusqu'aux champs
 *  conditionnels, qui est aussi le chemin nominal. */
async function allerAuxCaracteristiques(
  user: ReturnType<typeof userEvent.setup>,
  type: RegExp,
  contrat: RegExp = /^vendre$/i,
) {
  await user.click(typeBien(type));
  await user.click(screen.getByRole('radio', { name: contrat }));
  await user.click(suivant()); //                          → étape 2 (où)
  await user.type(screen.getByLabelText(/ville/i), 'Dakar');
  await user.click(suivant()); //                          → étape 3 (caractéristiques)
}

beforeEach(() => {
  vi.clearAllMocks();
  geo.valeur = null;
  geo.loading = false;
  brouillon.etat.isLoading = false;
  brouillon.etat.draft = null;
  brouillon.etat.error = null;
  // TCK-465 — `flush()` rend désormais le SORT de l'écriture. `undefined` ne serait plus le
  // silence d'avant, ce serait une valeur que l'appelant ne sait pas lire.
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
});

describe('PropertyWizard — composition des étapes', () => {
  it('bloque l’avance tant que le type ET le contrat ne sont pas choisis', async () => {
    const user = userEvent.setup();
    monter();

    expect(suivant()).toBeDisabled();

    await user.click(typeBien(/^villa$/i));
    expect(suivant()).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /^vendre$/i }));
    expect(suivant()).toBeEnabled();
  });

  it('AC2 — un terrain ne demande ni chambres, ni meublé, ni année de construction', async () => {
    const user = userEvent.setup();
    monter();
    await allerAuxCaracteristiques(user, /^terrain$/i);

    expect(screen.queryByLabelText(/chambres/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/meublé/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/année de construction/i)).not.toBeInTheDocument();
    expect(screen.getByText(/statut foncier/i)).toBeInTheDocument();
  });

  it('AC3 — un appartement demande son étage, pas son nombre de niveaux', async () => {
    const user = userEvent.setup();
    monter();
    await allerAuxCaracteristiques(user, /^appartement$/i);

    expect(screen.getByLabelText(/chambres/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^étage/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nombre de niveaux/i)).not.toBeInTheDocument();
  });
});

describe('PropertyWizard — ce que la géo-IP pose et ce qu’elle propose', () => {
  it('AC6 — la ville reste vide tant que la suggestion n’est pas acceptée', async () => {
    geo.valeur = { city: 'Dakar', region: 'Dakar', country_code: 'SN', currency: 'XOF' };
    const user = userEvent.setup();
    monter();

    await user.click(typeBien(/^villa$/i));
    await user.click(screen.getByRole('radio', { name: /^louer$/i }));
    await user.click(suivant());

    const ville = screen.getByLabelText(/ville/i) as HTMLInputElement;
    expect(ville.value).toBe('');

    await user.click(screen.getByTestId('geo-suggestion'));
    expect(ville.value).toBe('Dakar');
  });

  it('pose le pays et la devise que la note de l’étape 1 promet à l’utilisateur', async () => {
    // ⚠ Volontairement AILLEURS qu'au Sénégal : `country` vaut `''` et `currency` vaut `'XOF'`
    // par défaut. Une localisation sénégalaise rendrait l'assertion vraie même si l'assemblage
    // ne posait RIEN — c'est exactement la coïncidence qui fait passer un test creux.
    geo.valeur = { city: 'Paris', region: 'Île-de-France', country_code: 'FR', currency: 'EUR' };
    const user = userEvent.setup();
    monter();

    await user.click(typeBien(/^villa$/i));
    await user.click(screen.getByRole('radio', { name: /^vendre$/i }));
    await user.click(suivant());

    await waitFor(() => {
      expect((screen.getByLabelText(/pays/i) as HTMLInputElement).value).toBe('FR');
    });

    await user.type(screen.getByLabelText(/ville/i), 'Paris');
    await user.click(suivant()); // → caractéristiques
    await user.click(suivant()); // → prix

    expect(screen.getByRole('combobox', { name: /devise/i })).toHaveTextContent('EUR');
  });
});

describe('PropertyWizard — la validation ne déborde jamais de l’étape courante', () => {
  it('n’exige PAS le prix, qui appartient à une étape non atteinte', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(typeBien(/^villa$/i));
    await user.click(screen.getByRole('radio', { name: /^vendre$/i }));
    await user.click(suivant());

    // Le prix est requis par le schéma, et l'étape 2 s'ouvre quand même : on ne réclame pas ce
    // qui n'a pas été demandé. C'est ce qui rend un parcours guidé supportable.
    expect(screen.getByLabelText(/ville/i)).toBeInTheDocument();
    expect(screen.queryByText(/prix.*requis/i)).not.toBeInTheDocument();
  });

  it('exige EN REVANCHE les champs de l’étape courante — la ville ne se saute pas', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(typeBien(/^villa$/i));
    await user.click(screen.getByRole('radio', { name: /^vendre$/i }));
    await user.click(suivant());
    await user.click(suivant()); // ville vide : refusé

    expect(await screen.findByText(/la ville est requise/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ville/i)).toBeInTheDocument();
  });

  it('ne déclenche à l’étape 3 que les champs que la MATRICE juge pertinents pour le type', async () => {
    const user = userEvent.setup();
    monter();

    // Un appartement a un étage : la valeur hors bornes bloque, ce qui prouve que l'étape
    // déclenche bien ses propres clés.
    await allerAuxCaracteristiques(user, /^appartement$/i);
    await user.type(screen.getByLabelText(/^étage/i), '500');
    await user.click(suivant());
    expect(await screen.findByText(/valeur irréaliste/i)).toBeInTheDocument();

    // Retour à l'étape 1, bascule sur un terrain : `floor_number` garde sa valeur invalide dans
    // l'état du formulaire, mais la matrice ne le déclare plus pertinent. Le déclencher
    // bloquerait l'utilisateur sur une erreur portant un champ qu'il ne VOIT PAS.
    await user.click(screen.getByRole('button', { name: /précédent/i }));
    await user.click(screen.getByRole('button', { name: /précédent/i }));
    await user.click(typeBien(/^terrain$/i));
    await user.click(suivant()); // → où
    await user.click(suivant()); // → caractéristiques
    await user.click(suivant()); // → prix, et c'est le point du test

    expect(screen.getByLabelText(/^prix/i)).toBeInTheDocument();
  });
});

describe('PropertyWizard — le brouillon', () => {
  it('enregistre à chaque changement, en portant l’étape courante', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(typeBien(/^villa$/i));
    await user.click(screen.getByRole('radio', { name: /^vendre$/i }));
    await user.click(suivant());
    await user.type(screen.getByLabelText(/ville/i), 'Thiès');

    await waitFor(() => {
      expect(brouillon.etat.save).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ city: 'Thiès', type: 'villa' }),
      );
    });
  });

  it('reprend un brouillon serveur à l’étape où il s’était arrêté, valeurs comprises', async () => {
    brouillon.etat.draft = {
      step: 3,
      data: { type: 'land', contract_type: 'sale', city: 'Mbour', price: 7000000 },
    };
    monter();

    expect(await screen.findByText('Étape 4 sur 6')).toBeInTheDocument();
    expect((screen.getByLabelText(/^prix/i) as HTMLInputElement).value).toBe('7000000');
    expect(screen.getByRole('status')).toHaveTextContent(/brouillon/i);
  });

  it('« Reprendre plus tard » vide la file d’écriture AVANT de quitter la page', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: /reprendre plus tard/i }));

    await waitFor(() => expect(brouillon.etat.flush).toHaveBeenCalledTimes(1));
    expect(routeur.push).toHaveBeenCalledWith('/app/properties');
    // L'ordre compte : pousser avant d'avoir vidé la file, c'est démonter le composant avec un
    // `setTimeout` de sauvegarde encore en vol — et perdre la dernière frappe.
    expect(brouillon.etat.flush.mock.invocationCallOrder[0]).toBeLessThan(
      routeur.push.mock.invocationCallOrder[0],
    );
  });

  /* ──────────────────────────────────────────────────────────────────────────────────────────
   * TCK-465 — « Reprendre plus tard » n'affirme jamais un enregistrement qui n'a pas eu lieu
   * ──────────────────────────────────────────────────────────────────────────────────────────
   *
   * ⚠ Le test juste au-dessus est la MOITIÉ de la preuve, et il faut le dire : un parcours qui
   * n'enregistrerait plus jamais rien et ne quitterait plus jamais la page cocherait « l'échec
   * remonte » sans rien valoir. C'est lui qui tient le cas nominal — `ok: true` → on navigue —
   * et les deux ci-dessous qui tiennent l'échec.
   */

  it('AC2 — une écriture refusée retient l’utilisateur sur la page et le lui dit', async () => {
    const user = userEvent.setup();
    brouillon.etat.flush.mockResolvedValue({
      ok: false,
      ecrit: true,
      error: new Error('PUT wizard-drafts failed (503)'),
    });
    monter();

    await user.click(screen.getByRole('button', { name: /reprendre plus tard/i }));

    await waitFor(() => expect(brouillon.etat.flush).toHaveBeenCalledTimes(1));
    expect(routeur.push).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/n’a pas pu être enregistré/i);
  });

  it('AC2 — « Réessayer » rejoue l’écriture, et une réussite libère la navigation', async () => {
    const user = userEvent.setup();
    brouillon.etat.flush.mockResolvedValueOnce({
      ok: false,
      ecrit: true,
      error: new Error('boom'),
    });
    monter();

    await user.click(screen.getByRole('button', { name: /reprendre plus tard/i }));
    await screen.findByRole('alert');
    expect(routeur.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /réessayer/i }));

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties'));
    expect(brouillon.etat.flush).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('AC1 — un autosave silencieux qui échoue est annoncé sans qu’on ait rien cliqué', async () => {
    // Le défaut d'origine dans sa forme la plus pure : la frappe part toute seule, le PUT meurt,
    // et l'écran continue de ressembler à un écran où tout va bien.
    brouillon.etat.error = new Error('PUT wizard-drafts failed (500)');
    monter();

    expect(
      await screen.findByText(/l’enregistrement automatique ne répond plus/i),
    ).toBeInTheDocument();
  });
});

/** Le chemin complet jusqu'au bouton de publication, photos comprises si on en passe une. */
async function allerJusquAuBout(
  user: ReturnType<typeof userEvent.setup>,
  options: { readonly photo?: boolean; readonly equipement?: boolean } = {},
) {
  await allerAuxCaracteristiques(user, /^villa$/i);
  if (options.equipement) await user.click(screen.getByRole('button', { name: /wifi/i }));
  await user.click(suivant()); //                                → prix
  await user.type(screen.getByLabelText(/^prix/i), '25000000');
  await user.click(suivant()); //                                → photos
  if (options.photo) {
    await user.upload(
      screen.getByTestId('media-dropzone-input'),
      new File(['x'], 'salon.jpg', { type: 'image/jpeg' }),
    );
  }
  await user.click(suivant()); //                                → finition
}

describe('PropertyWizard — la soumission', () => {
  it('envoie l’adresse IMBRIQUÉE et une intention de publication, puis ouvre le bien', async () => {
    const user = userEvent.setup();
    monter();
    await allerJusquAuBout(user);

    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(createPropertyAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPropertyAction).mock.calls[0][0]).toMatchObject({
      status: 'pending_review',
      visibility: 'private',
      address: { city: 'Dakar' },
    });
    // La ville ne part PAS au premier niveau : c'est le correctif central du ticket.
    expect(vi.mocked(createPropertyAction).mock.calls[0][0]).not.toHaveProperty('city');

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(brouillon.etat.clear).toHaveBeenCalledTimes(1);
  });

  it('AC7 — un échec des photos dit que le bien EST créé, et n’en crée pas un second', async () => {
    vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({
      ok: false,
      message: 'Envoi impossible',
    } as never);

    const user = userEvent.setup();
    monter();
    await allerJusquAuBout(user, { photo: true });
    await user.click(screen.getByRole('button', { name: /publier/i }));

    const avertissement = await screen.findByRole('alert');
    expect(avertissement).toHaveTextContent(/bien.*créé/i);
    expect(avertissement).toHaveTextContent(/photos/i);

    // Ni redirection ni brouillon effacé : le travail reste là où l'utilisateur peut le reprendre.
    expect(routeur.push).not.toHaveBeenCalled();
    expect(brouillon.etat.clear).not.toHaveBeenCalled();

    // Réessayer REJOUE l'envoi manquant — et ne recrée PAS le bien. C'est tout l'AC7 : un
    // parcours qui perd le travail à la dernière étape est pire qu'un formulaire.
    vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
    expect(uploadPropertyPhotosAction).toHaveBeenCalledTimes(2);
  });

  it('AC7 — une seconde tentative NE RENVOIE PAS les photos déjà passées', async () => {
    // Le cas dangereux n'est pas celui qui échoue deux fois : c'est celui où une écriture réussit
    // et l'autre non. Rejouer un envoi de photos qui a abouti DUPLIQUE les médias du bien, sans
    // rien afficher qui le laisse deviner.
    vi.mocked(setPropertyTagsAction).mockResolvedValueOnce({ ok: false, message: 'refusé' } as never);

    const user = userEvent.setup();
    monter([WIFI]);
    await allerJusquAuBout(user, { photo: true, equipement: true });
    await user.click(screen.getByRole('button', { name: /publier/i }));

    const avertissement = await screen.findByRole('alert');
    expect(avertissement).toHaveTextContent(/équipements/i);
    expect(avertissement).not.toHaveTextContent(/photos/i);
    expect(uploadPropertyPhotosAction).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(setPropertyTagsAction).toHaveBeenCalledTimes(2);
    expect(uploadPropertyPhotosAction).toHaveBeenCalledTimes(1);
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
  });

  it('AC7 — l’échec suit l’utilisateur JUSQU’À l’étape des photos, là où il peut le corriger', async () => {
    vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({
      ok: false,
      message: 'Fichier trop lourd',
    } as never);

    const user = userEvent.setup();
    monter();
    await allerJusquAuBout(user, { photo: true });
    await user.click(screen.getByRole('button', { name: /publier/i }));
    await screen.findByRole('alert');

    // Retour d'une étape : l'avertissement global reste en haut, mais le message du serveur doit
    // aussi être là où se trouve le fichier fautif.
    await user.click(screen.getByRole('button', { name: /précédent/i }));

    expect(screen.getByText('Fichier trop lourd')).toBeInTheDocument();
  });

  /**
   * Un brouillon COMPLET : tout ce que le schéma exige est déjà là. C'est la condition qui rend la
   * soumission implicite dangereuse plutôt que simplement inutile.
   */
  const BROUILLON_COMPLET = {
    title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
    currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
  };

  it('n’honore PAS un évènement `submit` reçu depuis le MILIEU du parcours', async () => {
    // À l'étape du prix, `price` est le seul champ qui bloque la soumission implicite au sens
    // HTML : un navigateur y soumet donc le formulaire sur Entrée, alors qu'aucun bouton de
    // soumission n'existe. Sans garde, le bien partirait publié depuis le milieu du parcours,
    // sans ses photos.
    //
    // ⚠ L'évènement est dispatché DIRECTEMENT, et c'est délibéré : ni jsdom ni `user-event` ne
    // reproduisent la soumission implicite du HTML (mesuré — une frappe sur Entrée dans ce champ
    // ne produit aucun `submit` sous jsdom, et le test passerait alors sans rien éprouver). Ce
    // qu'on vérifie ici est le contrat du gestionnaire : un `submit` qui arrive hors dernière
    // étape ne publie pas.
    brouillon.etat.draft = { step: 3, data: BROUILLON_COMPLET };
    const { container } = monter();

    await screen.findByText('Étape 4 sur 6');
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(screen.getByText('Étape 4 sur 6')).toBeInTheDocument());
    expect(createPropertyAction).not.toHaveBeenCalled();
  });

  it('honore EN REVANCHE un `submit` reçu sur la dernière étape', async () => {
    brouillon.etat.draft = { step: 5, data: BROUILLON_COMPLET };
    const { container } = monter();

    await screen.findByText('Étape 6 sur 6');
    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(createPropertyAction).toHaveBeenCalledTimes(1));
  });

  it('AC7 — l’utilisateur peut aussi continuer SANS les photos, plutôt que de réessayer sans fin', async () => {
    vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({
      ok: false,
      message: 'Envoi impossible',
    } as never);

    const user = userEvent.setup();
    monter();
    await allerJusquAuBout(user, { photo: true });
    await user.click(screen.getByRole('button', { name: /publier/i }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /continuer sans/i }));

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(brouillon.etat.clear).toHaveBeenCalledTimes(1);
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
  });
});
