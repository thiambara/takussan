import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-2602 — « Votre annonce est en ligne » : partager, compléter, booster (maquette
 * `app-entree-publier` a-8). AC1 : le partage WhatsApp porte l'adresse publique et le prix mis en
 * forme ; AC3 : en vérification, ni « Booster » ni « Partager » dans le DOM ; TCK-2615 : chaque sortie
 * vers l'espace marque l'arrivée d'une publication.
 */

const arrivee = vi.hoisted(() => ({ marquer: vi.fn() }));
vi.mock('@/lib/arrivee-de-parcours', () => ({ marquerArriveeDeParcours: arrivee.marquer }));

const presse = vi.hoisted(() => ({ copier: vi.fn() }));
vi.mock('@/lib/share', async (original) => ({
  ...(await original<typeof import('@/lib/share')>()),
  copyToClipboard: presse.copier,
}));

import { AnnonceEnLigne, type AnnonceEnLigneDonnees } from '../AnnonceEnLigne';
import { formatMontant } from '@/lib/format/currency';

const URL_PUBLIQUE = 'https://preview.takussan.com/fr/properties/studio-meuble-lumineux-a-mermoz-58204';

const STUDIO: AnnonceEnLigneDonnees = {
  id: 58204,
  titre: 'Studio meublé lumineux à Mermoz',
  reference: 'TK-58204',
  etat: 'en-ligne',
  type: 'studio',
  typeLibelle: 'Studio',
  contrat: 'rent',
  periode: 'monthly',
  prix: 250000,
  devise: 'XOF',
  quartier: 'Mermoz',
  ville: 'Dakar',
  meuble: true,
  surface: 38,
  etage: 2,
  entree: 1015000,
  photo: null,
  nombrePhotos: 4,
  urlPublique: URL_PUBLIQUE,
};

function rendre(annonce: Partial<AnnonceEnLigneDonnees> = {}, props: { numeroWhatsApp?: string | null; peutBooster?: boolean } = {}) {
  return render(
    withIntl(
      <AnnonceEnLigne
        annonce={{ ...STUDIO, ...annonce }}
        numeroWhatsApp={props.numeroWhatsApp === undefined ? '+221771234567' : props.numeroWhatsApp}
        peutBooster={props.peutBooster ?? true}
      />,
    ),
  );
}

/** Le texte du message WhatsApp, décodé du lien `wa.me/?text=`. */
function texteDuPartage(): string {
  const lien = screen.getByRole('link', { name: /Partager sur WhatsApp/ });
  const href = lien.getAttribute('href') ?? '';
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  return decodeURIComponent(href.slice('https://wa.me/?text='.length));
}

beforeEach(() => {
  vi.clearAllMocks();
  presse.copier.mockResolvedValue(true);
});

describe('TCK-2602 — l’annonce en ligne', () => {
  it('dit que l’annonce est en ligne, avec sa référence', () => {
    rendre();
    expect(screen.getByRole('heading', { level: 1, name: 'Votre annonce est en ligne' })).toBeInTheDocument();
    expect(screen.getByText(/Visible dès maintenant par les chercheurs ·/)).toHaveTextContent('Visible dès maintenant par les chercheurs · TK-58204');
    // La référence ne se coupe pas à son tiret : elle passe entière à la ligne.
    expect(screen.getByText('TK-58204')).toHaveClass('whitespace-nowrap');
  });

  it('AC1 — le partage WhatsApp porte l’adresse publique du bien et son prix mis en forme', () => {
    rendre();
    const texte = texteDuPartage();
    // Le prix tel que le produit l'écrit (U+00A0 entre les groupes) — jamais une espace tapée à la main.
    expect(texte).toContain(`${formatMontant(250000, 'XOF')} /mois`);
    expect(texte).toContain(`${URL_PUBLIQUE}?utm_source=whatsapp&utm_medium=share`);
    expect(texte).toContain('Studio meublé lumineux à Mermoz');
  });

  it('AC1 — le lien est encodé : le message ne casse pas la requête de wa.me', () => {
    rendre({ titre: 'Villa & jardin ? #1' });
    const href = screen.getByRole('link', { name: /Partager sur WhatsApp/ }).getAttribute('href') ?? '';
    // Ni blanc, ni `#`, ni `&`, ni `?` en clair après `text=` : tout le message est un seul paramètre.
    expect(href.slice('https://wa.me/?text='.length)).not.toMatch(/[\s#&?]/);
    const requete = new URL(href).searchParams.get('text');
    expect(requete).toContain('Villa & jardin ? #1');
    expect(requete).toContain(URL_PUBLIQUE);
  });

  it('copie l’adresse publique, et le dit', async () => {
    rendre();
    fireEvent.click(screen.getByTestId('copier-le-lien'));
    await waitFor(() => expect(presse.copier).toHaveBeenCalledWith(URL_PUBLIQUE));
    expect(await within(screen.getByTestId('copier-le-lien')).findByText('Lien copié')).toBeInTheDocument();
  });

  it('« Ajouter des photos » dit le compte et mène à l’onglet des photos du bien', () => {
    rendre();
    const lien = screen.getByRole('link', { name: /Ajouter des photos/ });
    expect(lien).toHaveTextContent('4 sur 10 · les annonces avec photos sont plus vues');
    expect(lien).toHaveAttribute('href', '/app/properties/58204?tab=media');
  });

  it('« Booster » ouvre le parcours de boost de la fiche, sans promettre de durée', () => {
    rendre();
    const liens = screen.getAllByRole('link', { name: /Booster/ });
    expect(liens.length).toBeGreaterThan(0);
    for (const lien of liens) expect(lien).toHaveAttribute('href', '/app/properties/58204?booster=1');
    expect(screen.queryByText(/pendant \d+ jours/)).not.toBeInTheDocument();
  });

  it('sans `boost.spend`, aucun « Booster »', () => {
    rendre({}, { peutBooster: false });
    expect(screen.queryByRole('link', { name: /Booster/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('carte-booster')).not.toBeInTheDocument();
  });

  it('les demandes arrivent sur WhatsApp au numéro vérifié ; sans lui, dans l’espace', () => {
    const { unmount } = rendre();
    // Le numéro ne se coupe pas en fin de ligne : ses blancs sont insécables (normalisation désactivée).
    const brut = { normalizer: (texte: string) => texte };
    expect(screen.getAllByText(/Les demandes arrivent sur WhatsApp au \+221\u00a077\u00a0123\u00a045\u00a067 et dans votre espace\./, brut).length).toBeGreaterThan(0);
    unmount();
    rendre({}, { numeroWhatsApp: null });
    expect(screen.queryByText(/sur WhatsApp au/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Les demandes arrivent dans votre espace.').length).toBeGreaterThan(0);
  });

  it('« Voir mon annonce » ouvre la page publique', () => {
    rendre();
    for (const lien of screen.getAllByRole('link', { name: 'Voir mon annonce' })) expect(lien).toHaveAttribute('href', URL_PUBLIQUE);
  });

  it('TCK-2615 — chaque sortie vers l’espace marque l’arrivée d’une publication', () => {
    rendre();
    const sorties = [
      ...screen.getAllByRole('link', { name: 'Aller à mon espace' }),
      screen.getByRole('link', { name: /Ajouter des photos/ }),
      ...screen.getAllByRole('link', { name: /Booster/ }),
    ];
    for (const sortie of sorties) {
      sortie.addEventListener('click', (e) => e.preventDefault());
      fireEvent.click(sortie);
    }
    expect(arrivee.marquer).toHaveBeenCalledTimes(sorties.length);
    expect(arrivee.marquer).toHaveBeenCalledWith('publication');
    for (const lien of screen.getAllByRole('link', { name: 'Aller à mon espace' })) expect(lien).toHaveAttribute('href', '/app');
  });
});

describe('TCK-2602 (AC3) — en vérification', () => {
  it('le titre dit « en vérification », et ni « Booster » ni « Partager » ni le lien public ne sont dans le DOM', () => {
    rendre({ etat: 'verification' });
    expect(screen.getByRole('heading', { level: 1, name: 'Votre annonce est en vérification' })).toBeInTheDocument();
    expect(screen.queryByText(/Booster/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Partager/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Copier le lien/)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('wa.me');
    expect(document.body.innerHTML).not.toContain(URL_PUBLIQUE);
  });

  it('« Voir mon annonce » mène à la fiche de l’espace, rien de public n’existant', () => {
    rendre({ etat: 'verification' });
    for (const lien of screen.getAllByRole('link', { name: 'Voir mon annonce' })) expect(lien).toHaveAttribute('href', '/app/properties/58204');
  });
});
