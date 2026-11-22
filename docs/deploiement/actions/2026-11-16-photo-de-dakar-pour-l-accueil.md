---
titre: "Fournir une photo de Dakar pour l'accueil de la connexion"
type: donnee
tickets: [TCK-2936]
cles: []
creee: 2026-11-16
preview: a-faire
production: a-faire
---

## Quoi faire

L'accueil de la connexion montre une villa d'Unsplash, sans lien avec Dakar : la constante
`PHOTO_D_ACCUEIL` de `takussan-web/src/components/auth/AccueilDeLaPorte.tsx`.

1. Le porteur fournit une photo de Dakar dont Takussan a les droits.
2. Une PR la pose dans `takussan-web/public/` et remplace l'URL de `PHOTO_D_ACCUEIL`.

L'action est faite dans un environnement quand cette PR y est déployée.

## Comment vérifier

`/fr/connexion`, au téléphone et au bureau : la photo est celle fournie, nette, sans recadrage gênant.

## Historique
