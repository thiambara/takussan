---
id: TCK-2641
title: "Bailleurs : une liste qu'on peut appeler, et une fiche-compte centrée sur l'argent du mandat"
status: todo
phase: P1
family: front
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2640, TCK-2649, TCK-2655, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2667]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
tags: [front, owners, payouts, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin d'agence retrouve un bailleur en deux secondes, l'appelle ou lui écrit sur WhatsApp, et lui dit ce qui lui reste à verser. Il crée le reversement et envoie le relevé depuis la fiche du bailleur, sans passer par trois pages.

## Contrat de données

- `GET /api/owners` avec `include=user`, recherche, `has_remaining` et comptes (TCK-2640).
- `GET /api/owners/{id}` et `PATCH /api/owners/{id}` pour `works_approval_threshold` (TCK-2640).
- Relevé : `GET /api/owner-statements?period=…&landlord_id=…` avec `remaining_to_pay`, `next_payout` et `properties[]` (TCK-2649). Exports `/owner-statements/pdf` et `/csv`, qui existent.
- Biens du bailleur : `GET /api/properties?filter[user_id]=…&include=occupancy` (TCK-2637).
- Documents du bailleur (mandat, pièce, RIB) : la lecture par cible du coffre (TCK-2655).
- Reversement : le dialogue existant, nourri par `GET /api/payouts/preparation` puis `POST /api/payouts`.
- Invitation, renvoi et révocation : les endpoints existants. Valeurs sensibles : `GET /api/owners/{id}/sensitive`, journalisé.
- Accès du bailleur dans l'agence, gestes aujourd'hui portés par la page Équipe :
  - `POST /api/agencies/{agency}/team/{user}/suspend|reactivate` (TCK-587, ADR-0031 §2). Le profil bailleur passe `blocked`, et le compte ne bouge pas ;
  - `DELETE /api/agencies/{agency}/members/{user}` (`AgencyMemberRemovalService`, capacité `team.remove`).

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-bailleurs&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écrans « Liste » et « Fiche du bailleur », au téléphone et au bureau.
  - Les montants de la maquette ne se recoupent pas entre pages (rapport maq-f4a) : ils ne font pas foi.
- **Titre « Bailleurs »** partout dans la page, et bouton « Inviter un bailleur ».
- **Liste, téléphone** :
  - recherche « Nom, téléphone… » ;
  - cartes : initiales, nom, « 7 biens · 6 occupés », « Reste à verser : … » en gras, boutons ronds Appeler / WhatsApp (44 px) ;
  - une invitation en cours dit « invitation envoyée il y a 3 j » et porte « Renvoyer ».
- **Liste, bureau** : tableau Bailleur · Téléphone · Biens (n · k occupés) · Encaissé ce mois · Reste à verser · Dernier versement · Statut, avec la recherche et le filtre « Avec reste à verser ».
- **Fiche (nouvelle route `/app/owners/[id]`)** :
  - carte d'identité : « Bailleur depuis … », Appeler / WhatsApp / Message ;
  - carte du mois, avec un sélecteur de mois **en français** : « Reste à verser » en tête, puis Encaissé · Commission · Déjà versé ;
  - « Créer le reversement » et « Envoyer le relevé » (le PDF du mois, partagé comme fichier au téléphone) ;
  - « Ses biens (n) », chacun avec l'état du mois ;
  - « Réglages du mandat » : plafond de travaux sans accord, modifiable, et commission de l'agence ;
  - « Documents » : mandat, pièce, RIB ;
  - pièces sensibles masquées, avec « Afficher » journalisé ;
  - « Accès et départ », en bas de fiche : « Suspendre l'accès » / « Réactiver », puis « Retirer de l'agence », séparé et destructif. Chaque geste dit ce qu'il fait. **« Retirer de l'agence » est reporté à [TCK-2753](TCK-2753-retirer-un-bailleur-de-l-agence.md)** (ce que retirer un bailleur veut dire — biens, baux, mandat — reste une décision du porteur, 2026-11-12).
- **Téléphone (360-390 px)** : « Créer le reversement » et « Envoyer le relevé » dans une barre collée. Aucune colonne ne sort du cadre.
- **Bureau (≥ 1280 px)** : la fiche en deux colonnes dès `lg`. À gauche l'identité, les réglages et les documents ; à droite le relevé du mois, les biens et les derniers reversements. « Créer le reversement » se place dans la case « Reste à verser ».

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md).

**Rien ne se perd** (audit famille 4, § 2, *Fonctions existantes* 1-6, lues dans `OwnersList.tsx` et `InviteOwnerSheet.tsx`) :

- sous-titre ;
- bouton d'invitation, si la capacité est accordée ;
- mention de confidentialité. RIB, NINEA et numéro de pièce sont masqués ; « Afficher » révèle **et journalise**, « Masquer » remasque. La mention passe de la liste à la fiche ;
- nom (raison sociale + personne de contact pour une société), e-mail, téléphone, statut ;
- « Renvoyer l'invitation » et « Révoquer » sur une invitation en cours ;
- feuille d'invitation : e-mail, prénom, nom, téléphone, type, raison sociale, et ses erreurs (« déjà membre », « interdit ») ;
- état vide avec le bouton d'invitation ;
- accès réservé à l'admin ;
- **suspendre, réactiver et retirer un bailleur**, aujourd'hui dans la page Équipe. La famille 6 (TCK-2667) en sort les bailleurs, à condition que cette fiche porte ces gestes : **ce ticket se merge avant TCK-2667, ou en même temps**, sinon les gestes disparaissent (régression). Mêmes gardes qu'aujourd'hui : confirmation, double authentification de l'agence (TCK-1203, `avecGardeDoubleFacteur`, `TeamConsole.tsx:242`), effet dit avant d'agir.

Autres contraintes :

- **Téléphone** : celui du compte, sinon celui de l'invitation (TCK-2640). `tel:` et `https://wa.me/` se construisent par l'aide existante (`whatsappHref`), sans recopie.
- **Les montants viennent de l'API**, jamais recalculés : « Reste à verser » est `remaining_to_pay`.
- **Plafond de travaux** :
  - éditable seulement si l'API accorde l'écriture ; ailleurs il est en lecture ;
  - la saisie des montants est groupée selon la langue (règle TCK-564) ;
  - l'écran dit l'effet : « au-delà, le bailleur approuve le devis avant les travaux ».
- **Sélecteur de mois** : un composant de l'application, jamais `<input type="month">` (P2 de l'audit : « November 2026 »).
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, formatage par `useFormatteurs()`.

## Delta à produire

- [ ] Liste en cartes au téléphone et en tableau au bureau, avec la recherche, le filtre, Appeler et WhatsApp.
- [ ] Page `/app/owners/[id]` : identité, relevé du mois, biens, réglages du mandat, documents, pièces sensibles.
- [ ] Édition du plafond. « Créer le reversement » prérempli pour ce bailleur. « Envoyer le relevé ».
- [ ] Tests :
  - téléphone repris du compte ;
  - lien de chaque ligne ;
  - montant venu de l'API ;
  - plafond éditable (admin) ou en lecture ;
  - sélecteur de mois localisé ;
  - Renvoyer / Révoquer atteignables au téléphone ;
  - suspendre, réactiver et retirer depuis la fiche, sous double authentification.

## Critères d'acceptation

- [ ] AC1 — owner1 de la démo (téléphone sur le compte, pas sur l'invitation) :
  - la liste affiche son numéro ;
  - « Appeler » porte `tel:+221…` ;
  - « WhatsApp » porte `https://wa.me/221…`.
- [ ] AC2 — Chaque bailleur actif de la liste mène à `/app/owners/{id}`. Le « Reste à verser » de la fiche est exactement `totals.remaining_to_pay` de la réponse réseau.
- [ ] AC3 — Plafond porté à 150 000 F :
  - le réseau montre `PATCH /api/owners/{id}` avec `{works_approval_threshold: 150000}` ;
  - la valeur reste après rechargement ;
  - pour un compte sans `owners.update`, le champ est en lecture seule.
- [ ] AC4 — À 390 px, pour une invitation en cours, « Renvoyer » et « Révoquer » sont visibles et touchables (≥ 44 px), et aucune cellule ne déborde.
- [ ] AC5 — Le sélecteur de mois affiche « novembre 2026 » en `fr` et « November 2026 » en `en`, quelle que soit la langue du navigateur. `grep 'type="month"'` ne rend rien dans les écrans touchés.
- [ ] AC6 — « Créer le reversement » ouvre le dialogue existant avec ce bailleur présélectionné et les paiements de `payouts/preparation`. Le reversement créé apparaît dans « Derniers reversements ».
- [ ] AC7 — Sur la fiche d'un bailleur actif, « Suspendre l'accès » envoie `POST /api/agencies/{agency}/team/{user}/suspend` après confirmation et double authentification. Le statut affiché devient « Suspendu », et « Réactiver » le rétablit. « Retirer de l'agence » envoie `DELETE …/members/{user}` — **reporté à TCK-2753** : AC7 se juge sans ce geste.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2641.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'onglet « Invitations » séparé, et le relevé envoyé par WhatsApp en un geste (ambition de l'audit).
- Les moyens de versement du bailleur.
- L'étiquette du menu (« Propriétaires » → « Bailleurs ») : c'est la coque, famille 3.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_

- 2026-11-12 — vérification adverse (d1, moyen) : la fiche (`GET /api/owners/{id}`, et la réponse du `PATCH`)
  servait `figures`, `last_payout` et `next_payout` à l'admin d'agence sans `payouts.create`, à qui la liste ne
  sert aucun montant et le relevé répond 403. `OwnerDirectory::detail()` prend la règle (`readsMoney`) de ses deux
  appelants : sans elle, les trois sont `null` et ne sont pas calculés. Au front, sous `droits.reversement` (la même
  règle pour qui atteint la page, le super-admin n'y entrant pas) : ni la carte du mois — qui aurait dit « le
  bailleur n'a pas encore de compte » —, ni « Envoyer le relevé » (en-tête, lien PDF, barre d'action).
  `tests/Feature/Owners/OwnerDetailMoneyTest.php` (3) : 2 rouges avant ; ablations (relevé calculé sans la règle,
  dernier versement sans la règle, `PATCH` à `true`) toutes rouges. Front : un cas de
  `FicheDuBailleur.tck-2641.test.tsx`, rouge avant ; les trois gardes ablatées une à une, rouges.
