import { describe, expect, it } from 'vitest';
import {
  destinationInterne,
  doitPoserLaQuestionDIntention,
} from '@/lib/redirection-interne';

/**
 * TCK-493 — le filtre de redirection, désormais partagé entre le callback OAuth
 * et la question d'orientation.
 *
 * Il existait déjà, écrit à la main dans le callback, et n'était couvert par
 * aucun test. Le sortir dans un module lui donne enfin des cas nommés — c'est la
 * moitié du gain de l'extraction.
 */
describe('destinationInterne', () => {
  it('laisse passer un chemin interne', () => {
    expect(destinationInterne('/app/properties/42')).toBe('/app/properties/42');
    expect(destinationInterne('/app?onglet=baux')).toBe('/app?onglet=baux');
  });

  it('refuse une URL absolue', () => {
    expect(destinationInterne('https://evil.tld/phish')).toBe('/app');
  });

  it('refuse un chemin protocole-relatif — le cas qui RESSEMBLE à un chemin interne', () => {
    // `//evil.tld` commence par `/` : un filtre qui ne teste que ça le laisse
    // passer, et le navigateur part sur un autre domaine.
    expect(destinationInterne('//evil.tld')).toBe('/app');
    expect(destinationInterne('//evil.tld/app')).toBe('/app');
  });

  it('refuse la variante à antislash', () => {
    // Plusieurs navigateurs normalisent `\` en `/` : `/\evil.tld` vaut alors
    // `//evil.tld`.
    expect(destinationInterne('/\\evil.tld')).toBe('/app');
  });

  it('retombe sur le défaut quand rien n’est fourni', () => {
    expect(destinationInterne(null)).toBe('/app');
    expect(destinationInterne(undefined)).toBe('/app');
    expect(destinationInterne('')).toBe('/app');
  });

  it('accepte un défaut explicite', () => {
    expect(destinationInterne(null, '/onboarding/host')).toBe('/onboarding/host');
  });
});

/**
 * TCK-493 / AC5 — la question ne se repose pas.
 *
 * La règle vit hors du composant serveur pour être éprouvable : la page ne fait
 * plus que l'appeler. C'est ce qui distingue un critère MESURÉ d'un critère
 * raisonné.
 */
describe('doitPoserLaQuestionDIntention', () => {
  it('pose la question à un compte neuf, sans réponse et sans profil', () => {
    expect(doitPoserLaQuestionDIntention(undefined, [])).toBe(true);
    expect(doitPoserLaQuestionDIntention(null, [])).toBe(true);
  });

  it('ne la repose pas à qui a répondu', () => {
    expect(doitPoserLaQuestionDIntention('search', [])).toBe(false);
    expect(doitPoserLaQuestionDIntention('publish', [])).toBe(false);
  });

  it('ne la repose pas à qui a PASSÉ — passer est une réponse', () => {
    // Sans ce cas, « passer » deviendrait « repousser à la prochaine
    // connexion » : la question reviendrait à chaque session.
    expect(doitPoserLaQuestionDIntention('skipped', [])).toBe(false);
  });

  it('ne la pose jamais à un compte qui porte déjà un profil d’agence', () => {
    expect(doitPoserLaQuestionDIntention(null, [{ agency_id: 42 }])).toBe(false);
  });

  it('la pose encore à un compte dont les profils ne sont rattachés à aucune agence', () => {
    // Un courtier ou un prestataire sans collaboration n'a pas d'espace : la
    // question garde son sens pour lui.
    expect(doitPoserLaQuestionDIntention(null, [{ agency_id: null }])).toBe(true);
  });

  it('une réponse vide n’en est pas une', () => {
    expect(doitPoserLaQuestionDIntention('', [])).toBe(true);
  });
});
