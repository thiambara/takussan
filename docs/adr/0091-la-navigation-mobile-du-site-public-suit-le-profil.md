# ADR-0091 — Le site public a une barre d'onglets au téléphone, et ses onglets suivent le profil connecté

- **Statut** : Accepté le 2026-11-08 par le porteur (audit UX famille 1, décision 2a, puis choix sur maquette avec la règle par profil)
- **Date** : 2026-11-08
- **Tickets** : TCK-2493, TCK-2494
- **Prolonge** : [ADR-0089](0089-le-menu-de-app-se-derive-du-profil-actif.md) — la disposition par persona devient aussi la source des onglets du site public ; [ADR-0090](0090-la-coque-de-app-sans-barre-du-haut.md) n'est pas modifié

## Contexte

Relevé sur `dev` (4152090b0) le 2026-11-08, au téléphone (390 × 844) — [audit, § Navigation publique](../qa/audit-ux-2026-11/01-site-public.md#navigation-publique--desktop-et-mobile) :

- le menu mobile ne porte que Connexion, Publier et la langue ; **Agences et Agents ne sont atteignables que par le pied de page** ;
- **connecté, aucun lien ne mène à son espace** : un locataire n'atteint ni son loyer, ni ses visites, ni ses messages depuis le site, et le menu lui propose « Publier une annonce » ;
- **trois couches flottent sans arbitrage** en bas de l'écran (dock du comparateur ≈ 190 px, bouton « Messagerie », barre collante de la fiche) : jusqu'à 45 % de l'écran recouvert.

`/app` a résolu le même problème par une barre d'onglets dérivée du persona actif (TCK-2481). La charte ([`design-guidelines.md`](../design-guidelines.md)) ne prévoit aucune navigation basse sur le site public : c'est un **écart de charte**, accepté ici.

## Décision

1. **Sous `lg`, le site public a une barre d'onglets à cinq cases**, fixée en bas, avec icône et libellé.
2. **Ses cases suivent le profil connecté.** Case 1 : **Explorer**, toujours — c'est le site public. Cases 2 et 3 : les deux premiers `onglets` du persona actif dans `DISPOSITIONS` (`lib/navigation/dispositions.ts`), hors tableau de bord et messagerie. Case 4 : **Messages**. Case 5 : **Compte** pour l'anonyme, **Moi** (avatar en initiales) pour le connecté, qui ouvre l'espace du persona.

   | Profil | Cases 2 et 3 |
   |---|---|
   | anonyme | Favoris · Publier |
   | client | Favoris · Visites |
   | locataire | Loyer · Interventions |
   | bailleur | Mes biens · Demandes |
   | agent | Demandes · Visites |
   | admin d'agence | Demandes · Biens |
   | hôte | Mes biens · Réservations |
   | prestataire | Interventions · Documents |

   Une seule source : un persona ajouté à `DISPOSITIONS` a sa barre publique sans autre écriture. Les compteurs sont ceux du menu de `/app`. Changer d'espace change la barre. Le profil de plateforme est hors du site public.
3. **« Moi » rend le menu du persona** (sélecteur d'espace en tête quand il y en a plusieurs, action principale — « Publier un bien » pour les pros —, groupes de la disposition, puis langue, aide, légal, déconnexion). Ce qui quitte la barre (Favoris et Publier pour un pro) y reste atteignable.
4. **Une seule couche d'action en bas de l'écran à la fois** : la barre d'onglets, OU la barre d'actions d'une page (fiche d'un bien), OU un tunnel (visite, paiement, revendication, publication). La barre disparaît sur la fiche, dans les tunnels, sur les pages par lien et sur la carte plein écran. Le comparateur devient une pastille repliée au-dessus de la barre ; le bouton « Messagerie » flottant disparaît au profit de l'onglet.
5. **En bureau**, l'en-tête tient sur une ligne (Louer · Acheter · Agences, recherche, favoris, compte, « Publier un bien ») ; la rangée de catégories ne reste que sur les pages de découverte ; connecté, un menu « Mon espace » montre les lignes et compteurs du persona.

## Conséquences

- La disposition par persona d'ADR-0089 a désormais **deux lecteurs** (la coque de `/app` et le site public) : un changement d'`onglets` se voit sur les deux surfaces, et la garde de ses identifiants vaut pour les deux.
- La charte gagne une règle écrite : « une seule couche d'action en bas à la fois ».
- Le menu hamburger public disparaît ; langue, aide et légal passent dans Compte / Moi.
- 60 px pris en permanence sur les pages de découverte au téléphone, ce qu'un `<main>` réservé doit absorber (rien caché sous la barre, cf. TCK-503).

## Options écartées

- **Publier au centre** (bouton rond surélevé) : met le propriétaire en avant, mais cinq formes de bouton central selon le persona ; écartée sur maquette.
- **Barre flottante** qui se masque au défilement : gagne de la place, mais l'onglet n'est jamais là où le pouce l'attend.
- **Une barre fixe identique pour tous** (décision 2a seule) : un locataire n'y trouve ni son loyer ni ses interventions — c'est la demande du porteur qui l'écarte.

## Application

TCK-2493 (barre, règle des couches, Compte / Moi), TCK-2494 (en-tête de bureau et menu « Mon espace »). Les maquettes de référence sont sur `/fr/playground/maquettes?p=navigation` (approche A), gardées jusqu'à l'implémentation — non versionnées, dans l'arbre de travail du porteur ([README de l'audit, § Maquettes](../qa/audit-ux-2026-11/README.md#maquettes)).

## Amendement du 2026-11-09 — l'en-tête de page au téléphone

Demande du porteur (TCK-2568) : au téléphone, beaucoup d'écrans des maquettes retenues **n'ont pas la barre du site** ; le site doit les suivre, écran par écran. Le décompte, mesuré maquette par maquette et route par route, est dans [`docs/qa/audit-ux-2026-11/entetes-mobiles.md`](../qa/audit-ux-2026-11/entetes-mobiles.md).

1. **Sous `lg`, la barre du site (marque, recherche) ne paraît que là où la maquette la montre** : l'accueil, les pages légales, et toute page qu'aucune maquette ne décrit (la sélection de favoris partagée, la page 404). Une page neuve la garde par défaut.
2. **La liste des biens** garde la barre, mais sa marque cède la place à un **retour** : « ← [la recherche en vigueur] », l'en-tête de sa maquette.
3. **Partout ailleurs, la page porte son propre en-tête** : une rangée collante de 56 px (retour, titre, action — comparateur, fiche d'agent, tunnel de réservation), des boutons posés sur la photo (fiche d'un bien, d'une agence), un grand titre (Favoris, Compte, l'annuaire « Professionnels »), ou la coque d'une page par lien. Le composant partagé est `EnTeteDePage`. Son retour revient à la page précédente du site, sinon à un repli sûr ; c'est un vrai lien. « Précédente du site » se juge par la Navigation API, à défaut par le référent ET un historique d'au moins deux entrées : un nouvel onglet ouvert depuis le site a le référent du site et rien derrière lui.
4. **Une seule règle**, `enTeteAuTelephone(chemin)` (`lib/navigation/barre-publique.ts`), lue par la barre ET par sa cale. Une page dont le haut ne dépend pas du seul chemin le déclare elle-même : `auTelephone="barre-du-site"` pour un bien retiré ; `auTelephone="marque"` (le logo seul, sans recherche, la barre de marque de la maquette) pour une page inconnue, une erreur ou une panne de l'API ; un `EnTeteDePage` pour l'état d'une page qui a son écran de maquette (la réservation d'un bien au mois : « ← Retour au bien »). Le bas suit la même logique : le bien retiré déclare la barre d'onglets que le chemin d'une fiche n'a pas (`<BarreDOngletsPublique presente />`).
5. **Le bureau ne change pas** : dès `lg`, la barre du site reste sur toutes les pages (§ 5).
6. **Une route ne quitte la barre qu'avec son en-tête.** La faire basculer dans la règle avant que ses pages — et ses 404 — portent leur en-tête lui ôte la barre sans rien à la place (revue du 2026-11-09). L'annuaire et les fiches d'agence et d'agent basculent donc avec leurs pages (TCK-2521 → TCK-2523), pas avant.

Conséquence : tout élément collant qui supposait la barre de 69 px au-dessus de lui (`sticky top-[69px]`) se cale, sur ces routes, sous l'en-tête de la page ou à `top-0`.
