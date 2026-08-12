---
id: TCK-242
title: "Refonte design fiches publiques agence & agent"
status: done
phase: P1
family: front
estimate: M
wave: 27
created: 2026-05-09
updated: 2026-05-09
depends_on: [TCK-129]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
  models: []
tags: [front, design-system, public, agency, agent]
---

## Objectif utilisateur

Le visiteur public qui consulte la fiche d'une agence ou d'un agent reconnaît instantanément l'identité visuelle Takussan (mêmes header / footer / typographie / palette que la homepage et la fiche bien) et peut contacter l'agence/agent depuis des CTA conformes au design system.

## Contrat de données

- Pages côté front uniquement. Endpoints publics existants `GET /api/public/agencies/{slug}` et `GET /api/public/agents/{slug}` consommés tels quels (aucun changement contrat).
- `PropertyListItem` réutilisé pour la liste des biens de l'agence/agent.

## Direction UX / Artistique

- **Référence** : `(public)/page.tsx` (homepage) et `(public)/properties/[slug]/page.tsx` (fiche bien). Même Navbar + spacer + Footer + palette Lin + `BogolanPattern` discret en background.
- **Ambiance** : ancrage local contemporain, sobre et chaleureux. Photo agence/agent hero, métadonnées (ville, années d'expérience, langues parlées) en eyebrow uppercase tracking, biens en `PropertyRow` (variante listing).
- **CTA contact** : boutons primaires (terracotta) et outline pour "Appeler / Email / WhatsApp" — jamais de couleurs hard-codées.
- **Empty state** "Aucun bien à afficher" : ton accueillant, sans dashed borders ni gris brut.

## Contraintes strictes (métier)

- **Aucun `<img>`** dans la page — `next/image` partout (interdiction du DS).
- **Aucun token hors-DS** : interdire `text-stone-*`, `border-stone-*`, `bg-stone-*`. Utiliser exclusivement `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-muted`.
- **Typo h1** : `font-display` (Bricolage Grotesque) systématique.
- **Header/Footer obligatoires** : la fiche doit être englobée par la `Navbar` + spacer (h-[133px]) + `Footer` du layout public — comme toutes les autres pages publiques.
- Aucune régression de SEO : conserver les balises `<h1>`, `<address>`, métadonnées Open Graph existantes.

## Delta à produire

- [ ] Page `src/app/(public)/agencies/[slug]/page.tsx` réécrite : Navbar + spacer + main + Footer.
- [ ] Page `src/app/(public)/agents/[slug]/page.tsx` réécrite avec la même structure.
- [ ] Remplacement des `<img>` par `next/image` (avec ratios déclarés).
- [ ] Logo agence / avatar agent via `<Avatar>` shadcn (avec fallback initiales).
- [ ] CTA contact via `<Button>` shadcn (variants `default` + `outline`).
- [ ] Liste des biens via la grille `PropertyRow` (variante adaptée).
- [ ] Empty state "aucun bien" stylé tokens DS.
- [ ] Suppression de tout token legacy (`text-app-ink*`, `text-stone-*`, `text-app-accent`, etc.) des deux fichiers.
- [ ] Tests visuels manuels : cohérence avec la homepage validée (capture d'écran à comparer à `docs/image.png`).

## Critères d'acceptation

- [ ] AC1 — `/agencies/[slug]` et `/agents/[slug]` affichent la `Navbar` et le `Footer` du layout public, identiques à la homepage.
- [ ] AC2 — Aucun `<img>` ni `<select>`/`<input>`/`<button>` natif dans les deux fichiers (vérifié par `grep`).
- [ ] AC3 — Aucun token `stone-*` ou `app-ink*` dans les deux fichiers.
- [ ] AC4 — Le `h1` utilise `font-display`.
- [ ] AC5 — Les CTA contact (email, téléphone, WhatsApp si présent) sont des `<Button>` shadcn.
- [ ] AC6 — Lighthouse a11y ≥ 95 sur les deux pages.

## Hors périmètre

- Refonte de l'API `/public/agencies` ou `/public/agents`.
- Ajout de nouvelles données (KPIs agent, avis agence) — couvert par d'autres tickets.
- Refonte des pages `/super-admin/agencies/[id]` (ticket séparé).

## Notes d'implémentation

- Bouton shadcn (`base-ui`) : pas d'`asChild`. Utiliser la prop `render={<a … />}` pour rendre le CTA en lien sans wrapper.
- Champs DTO optionnels (whatsapp, city, bio, languages, years_of_experience) déclarés en optional côté front : si l'API ne les renvoie pas, le rendu reste propre (les blocs sont conditionnels).
- AC6 (Lighthouse a11y ≥ 95) à vérifier en navigation manuelle, non automatisé ici.
