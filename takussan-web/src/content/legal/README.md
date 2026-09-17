# Textes juridiques

Spec : [`docs/features.md` §2.10](../../../../docs/features.md#210-pages-légales-publiques) · tickets
[TCK-531](../../../../docs/backlog/tickets/TCK-531-consentements-vers-des-pages-legales-absentes.md)
et [TCK-537](../../../../docs/backlog/tickets/TCK-537-ecarts-entre-la-politique-de-confidentialite-et-le-code.md).

| Document | Fichier | Page |
|---|---|---|
| Conditions générales d'utilisation | `terms.ts` | `/fr/legal/terms` |
| Politique de confidentialité | `privacy.ts` | `/fr/legal/privacy` |
| Mentions légales | `notice.ts` | `/fr/legal/notice` |
| Identité de l'éditeur, hébergeurs, date de version | `editeur.ts` | — (interpolé dans les trois) |

**Rédigés le 2026-09-17 à la demande du porteur du produit**, pour le droit sénégalais
(loi n° 2008-12 sur les données personnelles, loi n° 2008-08 sur les transactions électroniques,
loi n° 2008-11 sur la cybercriminalité, COCC) et l'espace OHADA / UEMOA. **Ils décrivent ce que
la plateforme fait réellement**, relevé dans le code le même jour.

## Avant la mise en production

1. **Remplir `editeur.ts`** : chaque `[⚠ à compléter : …]` s'affiche tel quel sur la page —
   dénomination, forme juridique et capital, RCCM, NINEA, siège, téléphone, directeur de la
   publication.
2. **Déclarer les traitements à la CDP** et reporter le numéro du récépissé dans `privacy.ts` et
   `notice.ts`.
3. **Créer les trois boîtes** `contact@`, `privacy@` et `legal@takussan.com` — les textes les citent.
4. **Faire relire par un avocat inscrit au barreau du Sénégal.**
5. **Fermer TCK-537** : trois engagements de la politique ne sont pas encore tenus par le code.

## Tenir les textes à jour

Un texte juridique est un relevé : **un nouveau prestataire, un nouveau cookie, une nouvelle purge
ou un changement de commission se reporte ici dans le même changement**, puis `VERSION_DOCUMENTS`
avance dans `editeur.ts`. Une modification substantielle des CGU est notifiée 15 jours avant
(article 19).

## Format

Chaque fichier exporte trois chaînes — `fr`, `en`, `wo` — en gabarits (accents graves).

**Règles d'affichage** (`src/lib/legal-content.ts`) :

- `fr` vide → la page affiche « document en cours de rédaction », dans les trois langues.
- `en` ou `wo` vide → la page affiche le français, avec la mention qu'il n'existe qu'en français.
  **`wo` est vide à dessein** : une traduction juridique en wolof demande un traducteur qui en
  réponde.
- `en` ou `wo` rempli → la page l'affiche, avec la mention « traduction de courtoisie ; la version
  française fait foi ». Les CGU le stipulent aussi (article 3).

**Markdown accepté** (volontairement réduit, `src/components/legal/TexteJuridique.tsx`) : titres
`#`, `##`, `###` ; paragraphes séparés par une ligne vide ; listes `- ` et `1. ` **non
imbriquées** ; `**gras**`. Ni tableau, ni lien. `__tests__/textes.test.ts` refuse ce que le rendu
n'afficherait pas, et exige autant d'articles en anglais qu'en français.

⚠ Dans le texte, un accent grave `` ` `` doit être précédé d'une barre oblique inverse ; `${…}`
n'est employé que pour interpoler `editeur.ts`.
