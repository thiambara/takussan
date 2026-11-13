import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';

/**
 * TCK-2592 AC5 (décision 11a) — la console parle français : aucun texte `fr` des espaces de la console
 * commerciale ne dit « Lead », « Converti », « Pipeline », « Tags », « Feedback » ni « (CRM) ».
 *
 * Mots entiers, sans égard à la casse, pluriels et accords compris (« Leads », « convertis »). Les
 * arguments ICU (`{tag}`) ne sont pas du texte affiché : ils sont retirés avant la lecture.
 *
 * Deux sous-arbres ne se lisent pas, et ce ne sont pas des exceptions au vocabulaire :
 * - `nav.superAdmin` : la navigation de /super-admin, pas celle de /app ;
 * - `nav.palette.synonymes` : non affiché — les mots que la palette accepte EN RECHERCHE (« leads »
 *   y trouve les demandes de contact d'un ancien utilisateur), jamais rendus à l'écran.
 */

const ESPACES = ['crm', 'agentCrm', 'contactLeads', 'visits', 'bookings', 'nav', 'dashboard'] as const;
const NON_LUS = [
  ['nav', 'superAdmin'],
  ['nav', 'palette', 'synonymes'],
] as const;
const INTERDIT = /(?<![\p{L}\p{N}_-])(leads?|convertie?s?|pipelines?|tags?|feedbacks?)(?![\p{L}\p{N}_-])|\(CRM\)/iu;

type Arbre = string | { readonly [cle: string]: Arbre };

function textes(noeud: Arbre, chemin: readonly string[], sortie: [string, string][]) {
  if (NON_LUS.some((n) => n.every((seg, i) => chemin[i] === seg))) return sortie;
  if (typeof noeud === 'string') sortie.push([chemin.join('.'), noeud]);
  else for (const [cle, valeur] of Object.entries(noeud)) textes(valeur, [...chemin, cle], sortie);
  return sortie;
}

const sansArguments = (texte: string) => texte.replace(/\{\s*[\w.]+\s*(?=[,}])/g, '{');

describe('vocabulaire de la console (TCK-2592 AC5)', () => {
  const messages = fr as unknown as Record<string, Arbre>;

  it.each(ESPACES)('« %s » : aucun mot interdit dans les textes fr', (espace) => {
    expect(messages[espace], `l'espace ${espace} a disparu de fr.json`).toBeDefined();
    const fautifs = textes(messages[espace], [espace], [])
      .filter(([, texte]) => INTERDIT.test(sansArguments(texte)))
      .map(([cle, texte]) => `${cle} = ${texte}`);
    expect(fautifs).toEqual([]);
  });

  it('le motif attrape chacun des mots du ticket, et laisse passer ce qui n’en est pas un', () => {
    for (const mot of ['Lead', 'leads', 'Converti', 'convertis', 'Pipeline CRM', 'Tags', 'un tag', 'Feedback', 'Clients (CRM)']) {
      expect(INTERDIT.test(sansArguments(mot)), mot).toBe(true);
    }
    for (const texte of ['Retirer l’étiquette {tag}', 'Nouveau', 'Gagné', 'Étiquettes', 'compte rendu', 'leadership', 'étagère']) {
      expect(INTERDIT.test(sansArguments(texte)), texte).toBe(false);
    }
  });

  it('les sous-arbres non lus existent toujours (sinon l’exclusion couvrirait un nom mort)', () => {
    for (const chemin of NON_LUS) {
      let noeud: Arbre | undefined = messages[chemin[0]];
      for (const seg of chemin.slice(1)) noeud = typeof noeud === 'object' ? noeud[seg] : undefined;
      expect(noeud, chemin.join('.')).toBeDefined();
    }
  });
});
