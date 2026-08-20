import { afterEach, describe, expect, it } from 'vitest';

import { attendAucuneCleBrute, attendTexteAffichable } from '../cles-brutes';

/**
 * `attendAucuneCleBrute` est un CONTRÔLE. Un contrôle non testé est une croyance : celui qui ne
 * reconnaît plus sa cible passe au vert en ne regardant rien, et sa sortie ressemble à un succès
 * (c'est le mode de défaillance des dettes D-15, D-18 et D-44 de l'ardoise).
 *
 * Ces cas-ci le font donc échouer volontairement, sur les formes exactes que TCK-292 a produites.
 */

afterEach(() => {
  document.body.innerHTML = '';
});

function poser(html: string): void {
  document.body.innerHTML = html;
}

describe('attendAucuneCleBrute', () => {
  it('ÉCHOUE sur une clé de validation rendue telle quelle', () => {
    poser('<p>validation.tag.nameRequired</p>');
    expect(() => attendAucuneCleBrute()).toThrow(/validation\.tag\.nameRequired/);
  });

  it('ÉCHOUE même si la clé est noyée dans une phrase', () => {
    poser('<div><span>Erreur :</span><span>validation.setting.smsSenderId</span></div>');
    expect(() => attendAucuneCleBrute()).toThrow(/validation\.setting\.smsSenderId/);
  });

  it('ÉCHOUE sur une clé rendue dans un PORTAIL, hors du conteneur du render', () => {
    // Les primitives `ui/` (dialogue, select) montent hors de l'arbre rendu. Un balayage limité au
    // `container` du `render` ne verrait rien — d'où le défaut à `document.body`.
    const portail = document.createElement('div');
    portail.textContent = 'validation.search.savedSearchNameRequired';
    document.body.appendChild(portail);
    expect(() => attendAucuneCleBrute()).toThrow(/savedSearchNameRequired/);
  });

  it('nomme TOUTES les clés trouvées, pas seulement la première', () => {
    poser('<p>validation.tag.nameRequired</p><p>validation.tag.colorInvalid</p>');
    expect(() => attendAucuneCleBrute()).toThrow(/nameRequired[\s\S]*colorInvalid/);
  });

  it('PASSE sur les libellés français attendus — sinon il crierait sur tout', () => {
    poser('<p>Le libellé est requis.</p><p>Couleur hexadécimale invalide (ex : #2563eb).</p>');
    expect(() => attendAucuneCleBrute()).not.toThrow();
  });

  it('PASSE sur une prose qui parle de validation sans porter de clé', () => {
    // « validation » suivi d'un espace, ou d'un seul segment : ce n'est pas la forme d'une clé.
    poser('<p>La validation a échoué. Voir validation.md pour le détail.</p>');
    expect(() => attendAucuneCleBrute()).not.toThrow();
  });

  it('PASSE sur un DOM vide', () => {
    expect(() => attendAucuneCleBrute()).not.toThrow();
  });

  // ── Les deux formes ajoutées après le second passage de TCK-292 ────────────────────────────
  //
  // Le correctif des route handlers a DÉPLACÉ ce défaut au lieu de le supprimer : les handlers
  // ont cessé d'émettre « Not authenticated. », et le rendu s'est mis à afficher
  // `errors.api.unauthenticated`. Un contrôle qui ne connaît que la forme `validation.*` regarde
  // à côté et passe au vert.

  it('ÉCHOUE sur une clé d\'erreur API rendue telle quelle', () => {
    poser('<p>errors.api.unauthenticated</p>');
    expect(() => attendAucuneCleBrute()).toThrow(/errors\.api\.unauthenticated/);
  });

  it('ÉCHOUE sur `errors.api.unknown`, le cas du corps vide', () => {
    poser('<div><span>errors.api.unknown</span></div>');
    expect(() => attendAucuneCleBrute()).toThrow(/errors\.api\.unknown/);
  });

  it('ÉCHOUE sur « API error <n> », le `message` natif d\'ApiError', () => {
    poser('<p role="alert">API error 401</p>');
    expect(() => attendAucuneCleBrute()).toThrow(/API error 401/);
  });

  it('PASSE sur les libellés français correspondants', () => {
    poser('<p>Votre session a expiré. Reconnectez-vous.</p><p>Une erreur est survenue.</p>');
    expect(() => attendAucuneCleBrute()).not.toThrow();
  });

  it('PASSE sur une prose qui parle d\'erreurs d\'API sans porter de clé', () => {
    poser('<p>Les erreurs de l\'API sont documentées. Voir errors.md.</p>');
    expect(() => attendAucuneCleBrute()).not.toThrow();
  });
});

describe('attendTexteAffichable — la variante CHAÎNE, pour ce que renvoie un server action', () => {
  it('ÉCHOUE sur une clé i18n', () => {
    expect(() => attendTexteAffichable('errors.api.unauthenticated'))
      .toThrow(/errors\.api\.unauthenticated/);
  });

  it('ÉCHOUE sur « API error <n> »', () => {
    expect(() => attendTexteAffichable('API error 500')).toThrow(/API error 500/);
  });

  it('ÉCHOUE sur une chaîne vide — un message absent n\'est pas un message correct', () => {
    expect(() => attendTexteAffichable('')).toThrow();
  });

  it('ÉCHOUE sur `undefined`', () => {
    expect(() => attendTexteAffichable(undefined)).toThrow();
  });

  it('PASSE sur un libellé français', () => {
    expect(() => attendTexteAffichable('Votre session a expiré. Reconnectez-vous.')).not.toThrow();
  });

  it('nomme le contexte, pour qu\'un rouge dise QUI a produit la chaîne', () => {
    expect(() => attendTexteAffichable('errors.api.unknown', 'getMyProfilesAction'))
      .toThrow(/getMyProfilesAction/);
  });
});
