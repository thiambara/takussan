import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { PropertyDescription } from '../PropertyDescription';

/**
 * TCK-562 (M9) — la description d'un bien est un texte de l'annonceur, pas un texte de l'interface.
 *
 * Retour testeur du 2026-09-23 : « je suis en anglais et pourtant cette description est en
 * français ». Relevé sur preview le jour même, fiche `/en/…` à 390 px : le texte français héritait
 * du `lang="en"` de la page — un lecteur d'écran le prononçait donc en anglais — et rien ne disait
 * au visiteur qu'il lisait un texte d'annonceur, non traduit.
 *
 * Décision du porteur : SIGNALER la langue, pas de traduction automatique.
 */

const TEXTE = "Situé dans un quartier prisé, cette propriété offre voies d'accès asphaltées.";

const blocDuTexte = () => screen.getByText(TEXTE);

describe('TCK-562 (M9) — la langue de la description est dite, jamais traduite', () => {
  it('en anglais : le texte porte lang="fr", et une mention dit qu’il est en français', () => {
    render(withIntl(<PropertyDescription description={TEXTE} />, 'en'));
    expect(blocDuTexte()).toHaveAttribute('lang', 'fr');
    expect(screen.getByText('Description written in French by the lister')).toBeInTheDocument();
  });

  it('en wolof : la mention est en wolof', () => {
    render(withIntl(<PropertyDescription description={TEXTE} />, 'wo'));
    expect(blocDuTexte()).toHaveAttribute('lang', 'fr');
    expect(screen.getByText('Boroom yégle bi moo bind leeral bii ci farañse')).toBeInTheDocument();
  });

  it('en français : aucune mention — la description est dans la langue de l’interface', () => {
    const { container } = render(withIntl(<PropertyDescription description={TEXTE} />, 'fr'));
    expect(blocDuTexte()).toHaveAttribute('lang', 'fr');
    expect(screen.queryByText(/rédigée en/)).toBeNull();
    // Rien d'autre que le titre et le texte : la mention n'est pas simplement cachée.
    expect(container.querySelectorAll('section > p')).toHaveLength(1);
  });

  it('la mention n’est pas dans la langue du texte : seul le texte porte lang="fr"', () => {
    render(withIntl(<PropertyDescription description={TEXTE} />, 'en'));
    const mention = screen.getByText('Description written in French by the lister');
    expect(mention.closest('[lang]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Description' }).closest('[lang]')).toBeNull();
  });

  it('le texte tronqué et « Lire la suite » gardent chacun leur langue', () => {
    const long = `${TEXTE} `.repeat(8).trim();
    render(withIntl(<PropertyDescription description={long} />, 'en'));
    const bouton = screen.getByRole('button', { name: 'Read more' });
    expect(bouton.closest('[lang]')).toBeNull();
    expect(bouton.previousElementSibling).toHaveAttribute('lang', 'fr');
  });

  it('sans description : rien, pas même la mention', () => {
    const { container } = render(withIntl(<PropertyDescription description={null} />, 'en'));
    expect(container).toBeEmptyDOMElement();
  });
});
