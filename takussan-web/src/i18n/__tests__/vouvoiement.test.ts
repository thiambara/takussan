import { describe, expect, it } from 'vitest';

import { chainesDuSource, motsDuTutoiement, verifier } from '../../../scripts/vouvoiement.mjs';

/**
 * TCK-2683 — la garde du vouvoiement (ADR-0095, révisé le 2026-11-10 : « vouvoiement partout »).
 *
 * Ce fichier éprouve les fonctions de `scripts/vouvoiement.mjs` sur des cas écrits ici ; la garde
 * elle-même (`npm run check:vouvoiement`) les applique à `src/messages/fr.json` et à `src/`.
 */

describe('motsDuTutoiement', () => {
  it.each([
    ['Choisis ton canal pour entrer en contact.', 'Choisis'],
    ['Ton agence n’est pas encore là ?', 'Ton'],
    ['Une vitrine gratuite, tes annonces sur Takussan.', 'tes'],
    ['Essaie une autre ville ou élargis ta recherche.', 'Essaie'],
    ['Reviens bientôt — les annonces se renouvellent.', 'Reviens'],
    ['# interlocuteur pour t’accompagner', 't’'],
    ["# interlocuteur pour t'accompagner", "t'"],
    ['Connecte-toi pour continuer', '-toi'],
    ['Que veux-tu faire ?', '-tu'],
    ['C’est pour toi.', 'toi'],
    ['La ville est prête. Découvre les annonces du jour.', 'Découvre'],
    // Vérification adverse de TCK-2683 — trou n° 2 : « te » n'était pas lu.
    ['L’agence te rappelle demain.', 'te'],
    ['On te répond sous 24 h.', 'te'],
    ['Ça te plaît ?', 'te'],
    // Trou n° 3 : les impératifs n'étaient cherchés qu'en tête de phrase, capitalisés, dans une liste courte.
    ['Nous n’avons pas pu charger la liste. Réessaie dans quelques instants.', 'Réessaie'],
    ['Cette agence prépare ses prochaines annonces — reviens bientôt.', 'reviens'],
    ['Sélectionne une ville pour commencer.', 'Sélectionne'],
    ['Remplis le formulaire.', 'Remplis'],
    ['N’hésite pas à nous écrire.', 'N’hésite'],
    ['Pense à vérifier ton numéro.', 'Pense'],
    ['Viens nous voir à l’agence.', 'Viens'],
    ['Attends la réponse du bailleur.', 'Attends'],
    ['Va sur la page du bien.', 'Va'],
    ['Ensuite, clique sur « Publier ».', 'clique'],
    ['Le dossier est prêt : envoie-le au bailleur.', 'envoie'],
  ])('« %s » tutoie (%s)', (texte, mot) => {
    expect(motsDuTutoiement(texte)[0]).toBe(mot);
  });

  it.each([
    'Choisissez votre canal pour entrer en contact.',
    'Vérifiez votre boîte mail',
    'En tête de liste',
    'Le taux est fixé.',
    'yyyy-MM-dd\'T\'HH:mm',
    'Partage',
    'Ne touche à rien.',
    'Votre agence n’est pas encore là ?',
    // Ce que l'élargissement ne doit pas accuser : 1ʳᵉ personne, noms en tête, 3ᵉ personne, participes.
    'Je reviens vers vous demain.',
    'Demande en cours',
    'Note moyenne de 4 sur 5',
    'Relance prévue le 12 mars.',
    'Le système vérifie et envoie un rappel.',
    'Les montants saisis sont arrondis.',
    'Interne à l’agence. Le visiteur ne voit pas le compte rendu, et garde son propre avis.',
    'Une agence vous invite',
  ])('« %s » ne tutoie pas', (texte) => {
    expect(motsDuTutoiement(texte)).toEqual([]);
  });
});

describe('chainesDuSource', () => {
  it('relève les littéraux et le texte JSX avec leur ligne, jamais les commentaires', () => {
    const source = [
      "// Choisis ton bien : un commentaire ne s'adresse à personne",
      'const motif = /[\'"]/;',
      "const a = 'Choisis ton bien';",
      'const b = `Bonjour ${nom}, voici tes biens`;',
      'export const C = () => <p>Reviens bientôt sur la page</p>;',
    ].join('\n');
    const chaines = chainesDuSource(source, { tsx: true });
    const textes = chaines.map((c) => `${c.ligne}:${c.texte.trim()}`);
    expect(textes).toContain('3:Choisis ton bien');
    expect(textes).toContain('4:, voici tes biens');
    expect(textes).toContain('5:Reviens bientôt sur la page');
    expect(textes.some((t) => t.startsWith('1:'))).toBe(false);
  });

  // Vérification adverse de TCK-2683 — trou n° 1 : le texte JSX qui suit une expression, ou qui porte
  // `(`, `;`, `=`, `&` ou `|`, n'était jamais lu.
  it.each([
    ['<p>{nom}, vérifie ton adresse</p>', 'ton'],
    ['<p>Erreur (code 3) : réessaie dans un instant</p>', 'réessaie'],
    ['<p>Prix&nbsp;: choisis ton bien</p>', 'choisis'],
    ['<p>{n} biens — reviens bientôt</p>', 'reviens'],
    ['<p>Total = {t} ; reviens demain</p>', 'reviens'],
  ])('le texte JSX « %s » est lu (%s)', (jsx, mot) => {
    const source = `export const C = ({ nom, n, t }) => ${jsx};\n`;
    const { ecarts } = verifier({ dictionnaire: {}, fichiers: [{ chemin: 'src/C.tsx', source }], exceptions: [] });
    expect(ecarts.map((e) => e.mot)).toEqual([mot]);
  });

  it('le code lu entre deux accolades n’est pas une phrase : ses identifiants ne tutoient pas', () => {
    const source = [
      "import { x } from 'y';",
      'const TON_PAR_STATUT: Record<string, string> = { a: x };',
      "type Ton = 'clair' | 'sombre';",
      'const TON: Record<string, Ton> = {};',
      'export const C = () => <p>{TON.a} et {TON_PAR_STATUT.a}</p>;',
    ].join('\n');
    expect(verifier({ dictionnaire: {}, fichiers: [{ chemin: 'src/C.tsx', source }], exceptions: [] }).ecarts).toEqual([]);
  });

  it('une expression régulière qui contient un guillemet n’ouvre pas de chaîne fantôme', () => {
    const source = "const r = /[\"']+/g;\nconst x = 'Essaie encore une fois';\n";
    expect(chainesDuSource(source).map((c) => c.texte)).toContain('Essaie encore une fois');
  });
});

describe('verifier', () => {
  const fichierPropre = { chemin: 'src/components/Propre.tsx', source: "export const t = 'Choisissez votre bien';\n" };

  it('un texte du dictionnaire au tutoiement rougit, en nommant sa clé et le mot', () => {
    const { ecarts } = verifier({
      dictionnaire: { publicProfileIndex: { join: { title: 'Ton agence n’est pas encore là ?' } } },
      fichiers: [fichierPropre],
      exceptions: [],
    });
    expect(ecarts).toEqual([
      { ou: 'publicProfileIndex.join.title', mot: 'Ton', texte: 'Ton agence n’est pas encore là ?' },
    ]);
  });

  it('une chaîne en dur au tutoiement dans un composant rougit avec le fichier et la ligne', () => {
    const { ecarts } = verifier({
      dictionnaire: {},
      fichiers: [{ chemin: 'src/components/Carte.tsx', source: "import x from 'y';\n\nconst titre = \"Choisis ton bien\";\n" }],
      exceptions: [],
    });
    expect(ecarts).toEqual([{ ou: 'src/components/Carte.tsx:3', mot: 'Choisis', texte: 'Choisis ton bien' }]);
  });

  it('une exception avec sa raison passe', () => {
    const r = verifier({
      dictionnaire: { favorites: { sousTitre: 'Choisis sur Takussan et partagés avec vous.' } },
      fichiers: [],
      exceptions: [{ cle: 'favorites.sousTitre', raison: 'participe passé, pas un impératif' }],
    });
    expect(r).toEqual({ ecarts: [], exceptionsFautives: [] });
  });

  it('une exception sans raison rougit', () => {
    const r = verifier({
      dictionnaire: { favorites: { sousTitre: 'Choisis sur Takussan et partagés avec vous.' } },
      fichiers: [],
      exceptions: [{ cle: 'favorites.sousTitre', raison: '  ' }],
    });
    expect(r.exceptionsFautives).toEqual(['favorites.sousTitre : exception sans raison']);
    expect(r.ecarts).toHaveLength(1);
  });

  it('une exception qui ne couvre plus rien rougit (pas de tolérance qui attend son abus)', () => {
    const r = verifier({
      dictionnaire: { a: 'Choisissez votre bien' },
      fichiers: [],
      exceptions: [{ cle: 'a', raison: 'ancienne raison' }],
    });
    expect(r.exceptionsFautives).toEqual(["a : l'exception ne couvre plus aucun texte — la retirer"]);
  });
});
