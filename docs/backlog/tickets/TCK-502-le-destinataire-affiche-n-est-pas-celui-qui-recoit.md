---
id: TCK-502
title: "Fiche bien — la carte nomme un agent, le message part chez un autre"
status: done
phase: P2
family: bug
estimate: M
wave: 57
created: 2026-08-31
updated: 2026-08-31
depends_on: [TCK-500]
blocks: [TCK-504]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#12-recherche--découverte-publique
  models:
    - docs/models-spec.md#8-propertycollaborator
    - docs/models-spec.md#3-property
tags: [front, back, bug, messaging, property-detail, contact]
---

## Objectif utilisateur

Un visiteur qui écrit au sujet d'un bien doit écrire à la personne dont la fiche lui a montré le
nom et le visage.

## Contrat de données

Deux sources se contredisent aujourd'hui pour un même bien :

- la **carte de contact** de la fiche affiche `property.owner` — nom, avatar, lien vers le profil ;
- le **message** part au premier collaborateur de rôle `agent`, à défaut au propriétaire
  (`PropertyConversationResolver::recipientFor()`).

Relevé le 2026-08-31 sur la base de développement, bien `terrain-viabilise-a-guediawaye-PVh69x` :

```
owner affiché par la carte = Pape Cissé
collaborateur agent        = Ousmane Ndiaye     ← reçoit le message
collaborateur agent        = Demo Agent
```

**Second défaut, visible dans le même relevé : deux collaborateurs portent le rôle `agent`, et
rien ne dit lequel est le premier.** `firstWhere('role', Agent)` prend celui que la collection
rend en tête, c'est-à-dire l'ordre d'insertion — jamais décidé, jamais garanti. « L'agent
principal » n'existe dans aucune colonne.

## Direction UX / Artistique

La fiche doit nommer **celui qui recevra le message**. Que ce soit en corrigeant qui la carte
affiche, ou en corrigeant qui reçoit, est la décision produit à prendre — mais les deux ne peuvent
pas rester différents, parce que l'écran promet quelque chose que l'envoi ne tient pas.

## Contraintes strictes (métier)

1. Un « agent principal » doit être **défini**, pas déduit d'un ordre d'insertion : ou une colonne,
   ou un ordre explicite, ou la règle « le plus ancien accepté ».
2. La carte de contact, le contact anonyme (`contact-lead`), le message authentifié
   (`contact-message`) et la résolution (`.../conversation`) doivent tous désigner la **même**
   personne. Les trois derniers passent déjà par `PropertyConversationResolver` depuis TCK-500 ;
   la carte, non.
3. Le téléphone servi par `GET /public/properties/{slug}/contact` fait partie du lot : il doit
   être celui de la même personne.

## Delta à produire

- [ ] Décider et écrire la règle de l'agent principal (ADR si elle est structurelle).
- [ ] Rendre cette règle unique et partagée par la carte de contact et les trois chemins de contact.
- [ ] Tests : bien à deux collaborateurs `agent`, l'ordre d'insertion inversé ne change pas le
      destinataire ; la carte et l'envoi nomment la même personne.

## Critères d'acceptation

- [ ] AC1 — sur un bien dont un collaborateur `agent` diffère du propriétaire, le nom affiché par
      la carte de contact est celui qui apparaît dans le fil créé.
- [ ] AC2 — sur un bien à deux collaborateurs `agent`, le destinataire est le même quel que soit
      l'ordre d'insertion des deux lignes en base.
- [ ] AC3 — le contact anonyme, le message authentifié et la résolution nomment tous le même
      utilisateur, sur les deux biens ci-dessus.
- [ ] AC4 — le numéro rendu par `GET /public/properties/{slug}/contact` est celui de ce même
      utilisateur.
- [ ] AC5 — chaque test rougit si l'on rétablit l'ancienne règle (ablation).

## Hors périmètre

- Le choix produit lui-même (afficher l'agent, ou envoyer au propriétaire) : ce ticket exige la
  cohérence, il n'impose pas laquelle des deux vérités gagne.
- La messagerie de groupe.

## Notes d'implémentation

### Les deux décisions produit, prises avec l'utilisateur

1. **C'est l'agent qui gagne** : la carte, le téléphone et `peutContacterLeBien` viennent
   s'aligner sur la règle d'envoi, qui ne change pas.
2. **L'agent principal est le collaborateur `agent` le plus anciennement invité** (`invited_at`
   croissant, NULLS LAST, puis `id`).

⚠️ **La règle « le plus ancien ACCEPTÉ » que suggérait le ticket est inutilisable, et il faut le
savoir avant de la reproposer : RIEN dans le code ne renseigne `accepted_at`.**
`PropertyCollaboratorController::store()` ne pose que `invited_at`, il n'existe aucun parcours
d'acceptation, et seul le *seeder* remplit la colonne — d'où le relevé du ticket, pris sur la base
de développement, qui la montrait pleine. Adoptée telle quelle, elle aurait renvoyé au propriétaire
**tout** collaborateur créé par l'application. *Une règle qui n'est vraie que sur les données de
démonstration est une régression déguisée en rigueur.*

Pas d'ADR : `invited_at` + `id` est l'« ordre explicite » que la contrainte 1 autorise, sans
colonne neuve ni UI. Une colonne `is_primary` pilotable par l'agence reste la suite naturelle, et
elle mérite son ticket (migration, backfill, unicité par bien, écran).

### Là où vit la règle

`App\Services\Property\PrimaryPropertyContact::for()`, **seule définition**.
`PropertyConversationResolver::recipientFor()` y délègue et garde son vocabulaire ; `PropertyResource`
émet `primary_contact` ; `PublicPropertyController::contact()` y prend le téléphone (contrainte 3).

**`owner` est conservé tel quel, et c'est une décision.** Il porte la PROPRIÉTÉ, que six surfaces
lisent pour ça (duplication, tableau de bord, policies, éligibilité aux avis). Redéfinir la clé
aurait réparé la fiche en cassant le reste en silence ; la clé neuve ne ment nulle part.

### Le piège mesuré : l'AC2 acceptait le mauvais correctif

La première version du test AC2 ne faisait varier que **l'ordre d'insertion** — et elle restait
**verte sous l'ancienne règle**. Sondé sur ce dépôt : PostgreSQL sert l'eager load par l'index
unique `(property_id, user_id)`, si bien que « la première ligne de la collection » n'était pas la
première insérée mais le **plus petit `user_id`** — lignes insérées `id 1, 2`, collection rendue
`id 2, 1`. La prémisse du ticket (« l'ordre d'insertion ») décrivait donc le bon défaut avec la
mauvaise cause, et un AC calqué dessus ne l'attrapait pas.

Le test croise désormais les **deux** axes — ordre de création des utilisateurs (donc des
`user_id`) × ordre d'insertion des lignes, quatre configurations. Aucune règle « la première ligne
gagne » ne les passe toutes les quatre.

### Ablations (AC5)

| Ablation | Résultat |
|---|---|
| `firstWhere('role', Agent)` rétabli | **3 rouges** sur 6 (AC2, AC3, `invited_at` nulle) |
| `for()` rend `$property->owner` (l'ancienne carte) | **5 rouges** sur 6 |
| Front : `contact={property.owner}` au point d'appel | **1 rouge** |

⚠️ Le point d'appel front est gardé par une **lecture de la source**, pas par un rendu :
`property.owner` et `property.primary_contact` ont le même type `PropertyOwnerLite`, donc les
intervertir reste vert au typage, au lint et aux tests de rendu — *deux sources interchangeables
pour un même emplacement, dont une seule est juste*, exactement la forme du défaut corrigé ici.

### Effets de bord assumés

- `PropertyResource::ownerActsAsAgent()` → `actsAsAgent(User)` : la question se pose à l'identique
  pour un collaborateur. Deux docblocks de `app/Models/Profiles/` la citaient et sont à jour.
- `peutContacterLeBien({ proprietaireId })` → `{ destinataireId }` : le paramètre lisait
  `property.owner`, si bien qu'un **agent voyait « Envoyer un message » sur son propre bien** et
  que le bouton ouvrait un fil avec lui-même, refusé ensuite en 422 par le serveur.
- Trois routes `$isDetail` chargent maintenant `collaborators.user.media` (`public.properties.show`,
  `public.properties.compare`, `properties.show`) — sans quoi la nouvelle clé partait en
  chargement paresseux. `compare` y gagne aussi `owner.media`, qui lui manquait déjà.

**Vérification** : `PropertyPrimaryContactTest` 6 verts (37 assertions), suite front entière
3116 verts, Pint propre, `tsc --noEmit` propre, `npm run check:i18n` vert.
