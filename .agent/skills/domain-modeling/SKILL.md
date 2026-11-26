---
name: domain-modeling
description: Use when a discussion touches the project's domain vocabulary or a structural decision — challenging a term against docs/glossaire.md, sharpening a fuzzy word, writing or editing a glossary entry, or recognising that a decision needs an ADR. Runs alongside grilling under /grill-with-docs and /improve-codebase-architecture.
---

# Domain modeling — le glossaire et les décisions, écrits au moment où ils se tranchent

> Adapté de [`mattpocock/skills`](https://github.com/mattpocock/skills) (`skills/engineering/domain-modeling`,
> v1.3.2, licence MIT). Ce qui diffère de l'original, et pourquoi :
> [ADR-0137](../../../docs/adr/0137-une-competence-venue-d-ailleurs-s-adapte-elle-ne-s-installe-pas.md).

**Annoncer au début :** « J'utilise la compétence domain-modeling. »

Construire et affûter le modèle du domaine **pendant** la conception : contester les termes, inventer des scénarios
limites, et écrire le glossaire et les décisions dès qu'ils se cristallisent. *Lire* le glossaire pour en employer
les mots n'est pas cette compétence — c'est une habitude que toute tâche doit avoir. Celle-ci sert quand le modèle
**change**.

## Où vivent les choses

| Quoi | Où | Format |
|---|---|---|
| Le vocabulaire du domaine | `docs/glossaire.md` — un seul fichier, en français | [FORMAT-DU-GLOSSAIRE.md](FORMAT-DU-GLOSSAIRE.md) |
| Les décisions structurelles | `docs/adr/NNNN-<slug>.md` + une ligne dans l'index de `docs/adr/README.md` | `docs/adr/README.md` § Format |
| Ce que le produit fait | `docs/features.md`, `docs/models-spec.md` | ni l'un ni l'autre ne s'écrit ici : `/sync-specs` |

Jamais de `GLOSSARY.md` à la racine, ni de glossaire par sous-dossier : tout document de conception vit sous `docs/`.

## Pendant la séance

### Contester contre le glossaire

Quand le porteur emploie un terme autrement que `docs/glossaire.md`, le relever tout de suite : *« Le glossaire
définit **bailleur** comme X, tu sembles dire Y. Lequel ? »*

### Affûter le flou

Un terme vague ou surchargé reçoit une proposition de terme canonique : *« Tu dis "propriétaire" : le **bailleur**
(le profil), ou le titulaire du bien, qui peut être l'agence elle-même ? »*

### Éprouver par des scénarios

Quand on discute des relations entre concepts, les mettre à l'épreuve par des scénarios précis qui sondent les
limites, et forcer la précision sur la frontière entre deux concepts. Les profils multiples, les agences multiples,
le profil suspendu et la délégation sont ici les cas limites habituels.

### Confronter au code

Quand le porteur affirme comment une chose fonctionne, vérifier que le code est d'accord. Une contradiction se dit :
*« Le code ne retient qu'un agent principal par bien (ADR-0053), tu viens de dire qu'un bien peut en avoir deux.
Lequel est juste ? »* — et le code se **lit**, il ne se déduit pas d'un docblock (dette D-21 : des docblocks décrivent
encore un mécanisme supprimé).

### Écrire le glossaire au fil de l'eau

Un terme tranché entre dans `docs/glossaire.md` **sur-le-champ**, au format de
[FORMAT-DU-GLOSSAIRE.md](FORMAT-DU-GLOSSAIRE.md). Ne pas accumuler pour plus tard.

Le glossaire est un glossaire et rien d'autre : ni spec, ni brouillon, ni décisions d'implémentation. La seule trace
du code qu'il admet est la ligne *Dans le code*, qui nomme l'identifiant anglais d'un terme français.

### Reconnaître une décision structurelle

**Toute décision structurelle s'écrit en ADR avant l'implémentation** (`CLAUDE.md`). Une décision est structurelle
quand les trois critères tiennent :

1. **Difficile à défaire** : changer d'avis plus tard coûte vraiment ;
2. **Surprenante sans contexte** : un lecteur futur se demandera « pourquoi ont-ils fait ça ? » ;
3. **Fruit d'un vrai arbitrage** : il existait de vraies alternatives, et on en a choisi une pour des raisons
   précises.

Les trois critères servent à **reconnaître** la décision, jamais à se dispenser d'un ADR qu'elle exige. Quand ils
tiennent, rédiger l'ADR au format de `docs/adr/README.md` (statut `Proposé` tant que le porteur n'a pas tranché),
prendre le numéro suivant le plus haut de `docs/adr/` **et des branches ouvertes** (`git log --all --oneline | grep -o
"ADR-[0-9]*"`), et ajouter sa ligne à l'index. Si un seul critère manque, pas d'ADR : la décision vit dans le ticket.

Ce qui qualifie typiquement, ici :

- **une forme d'architecture** : « l'agence est la frontière d'isolation » ;
- **une technologie qui enferme** : moteur de base, moteur de recherche, hébergement — pas chaque paquet ;
- **une frontière de périmètre**, y compris les *non* : « le bailleur n'a que ses propres ressources » ;
- **un écart délibéré au chemin évident**, que le lecteur suivant « corrigerait » sinon ;
- **une contrainte invisible dans le code** : légale (droit sénégalais), contractuelle, d'un fournisseur ;
- **une alternative rejetée pour une raison non évidente**, sans quoi on la reproposera dans six mois.

### Signaler les conflits d'ADR

Une proposition qui contredit un ADR existant le dit, au lieu de passer outre : *« Contredit ADR-0002, mais mérite
d'être rouvert parce que… »*. Un ADR révoqué devient `Remplacé par ADR-NNNN`, il ne disparaît pas.
