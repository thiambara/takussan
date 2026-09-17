# Textes juridiques — où les déposer

Spec : [`docs/features.md` §2.10](../../../../docs/features.md#210-pages-légales-publiques) · ticket
[TCK-531](../../../../docs/backlog/tickets/TCK-531-consentements-vers-des-pages-legales-absentes.md).

**Ces textes sont fournis par le porteur du produit. Aucun agent ni aucun code ne les rédige.**

| Document | Fichier | Page |
|---|---|---|
| Conditions générales d'utilisation | `terms.ts` | `/fr/legal/terms` |
| Politique de confidentialité | `privacy.ts` | `/fr/legal/privacy` |
| Mentions légales | `notice.ts` | `/fr/legal/notice` |

Chaque fichier exporte trois chaînes — `fr`, `en`, `wo`. Coller le texte **entre les accents
graves** :

```ts
export const fr = `
# Article 1 — Objet

Premier paragraphe…
`;
```

**Règles d'affichage** (`src/lib/legal-content.ts`) :

- `fr` vide → la page affiche « document en cours de rédaction », dans les trois langues, même si
  une traduction existe. Le français fait foi.
- `en` ou `wo` vide → la page affiche le texte français, avec la mention qu'il n'existe qu'en
  français.
- `en` ou `wo` rempli → la page l'affiche, avec la mention « traduction de courtoisie ; la version
  française fait foi ». ⚠ Hypothèse à confirmer par le porteur.

**Markdown accepté** (volontairement réduit, `src/components/legal/TexteJuridique.tsx`) : titres
`#`, `##`, `###` ; paragraphes séparés par une ligne vide ; listes `- ` et `1. ` ; `**gras**`.
Tout le reste s'affiche tel quel, comme du texte — rien n'est interprété en HTML.

⚠ Dans le texte, un accent grave `` ` `` ou la séquence `${` doivent être précédés d'une barre
oblique inverse (`` \` ``, `\${`).
