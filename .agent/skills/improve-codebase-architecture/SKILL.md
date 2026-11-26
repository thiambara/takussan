---
name: improve-codebase-architecture
description: Use when the user asks to survey the codebase (or one area of it) for architectural friction and deepening opportunities — shallow modules, leaking seams, logic hard to test through its interface. Read-only survey rendered as an HTML report in the OS temp dir, then a grilling session on the candidate the user picks; what is kept becomes a ticket or an ADR, never an unasked refactor.
---

# Améliorer l'architecture — relever, puis interroger

> Adapté de [`mattpocock/skills`](https://github.com/mattpocock/skills)
> (`skills/engineering/improve-codebase-architecture` et `codebase-design`, v1.3.2, licence MIT) :
> [ADR-0137](../../../docs/adr/0137-une-competence-venue-d-ailleurs-s-adapte-elle-ne-s-installe-pas.md).

**Annoncer au début :** « J'utilise la compétence improve-codebase-architecture. »

Faire remonter les frictions d'architecture et proposer des **approfondissements** : des refactorisations qui font
d'un module **superficiel** un module **profond**. Le but est la testabilité et la lisibilité pour les agents.

C'est un **relevé, pas un sauvetage** : sur un code ancien il trouvera de vrais candidats, il ne démêlera rien seul.
Rien ne s'écrit dans le dépôt pendant le relevé.

Deux vocabulaires, employés exactement :

- **L'architecture** : [VOCABULAIRE-DE-CONCEPTION.md](VOCABULAIRE-DE-CONCEPTION.md) — module, interface, implémentation,
  profondeur, couture, adaptateur, levier, localité. Le lire avant de commencer. Pas de « composant », « service »,
  « API » ni « frontière » à leur place.
- **Le domaine** : `docs/glossaire.md`. On parle du « module d'encaissement des loyers », pas du
  « `LeasePaymentHandler` » ni du « service de paiement ».

Les ADR enregistrent des décisions que ce relevé ne remet pas en cause par principe (`docs/adr/README.md`, l'index).

## 1. Explorer

**Délimiter avant de chercher.** Approfondir un module paie en rendant ses changements futurs plus simples : peser
d'abord ce qui change souvent.

- Si le porteur a nommé une direction (un module, un sous-système, une douleur), la prendre et sauter le reste.
- Sinon, parcourir un bon tronçon d'historique (`git log --since=<6 semaines> --name-only --format=`, compté par
  fichier) pour trouver les **points chauds**, et les explorer d'abord. Les deux applications se relèvent à part :
  `takussan-api/app/` et `takussan-web/src/`. Si les changements sont épars sans point chaud, élargir.

Lire `docs/glossaire.md` et les ADR de la zone. Puis confier la marche à **un sous-agent d'exploration au contexte
neuf**, en lecture seule — il ne lance aucune suite de tests. Pas d'heuristique rigide : noter où l'on bute.

- Où comprendre un concept oblige-t-il à sauter entre beaucoup de petits modules ?
- Où un module est-il **superficiel**, son interface presque aussi complexe que son implémentation ?
- Où des fonctions pures ont-elles été extraites pour être testées, alors que les vrais défauts se cachent dans leur
  appel (pas de **localité**) ?
- Où des modules couplés fuient-ils à travers leur **couture** ?
- Quelles parties sont non testées, ou difficiles à tester par leur interface actuelle ?

Appliquer le **test de suppression** à tout module suspect : le supprimer concentrerait-il la complexité, ou la
déplacerait-il seulement ? « Concentrerait » est le signal recherché.

Côté API, les frictions récurrentes du dépôt sont déjà nommées dans `takussan-api/CLAUDE.md` (contrôleur de base,
`HasQueryBuilder`, autorisation par capacités) ; côté front, dans `takussan-web/CLAUDE.md` (`apiFetch` /
`apiRequest` / `useApiQuery`, route handlers BFF). Un candidat qui recoupe une dette de `docs/ardoise.md` la cite.

## 2. Présenter les candidats dans un rapport HTML

Écrire un fichier HTML autonome dans le répertoire temporaire du système, pour que rien n'atterrisse dans le dépôt :
`${TMPDIR:-/tmp}/architecture-takussan-<horodatage>.html`. L'ouvrir (`open <chemin>`) et donner le chemin absolu au
porteur. Format, schémas et style : [RAPPORT-HTML.md](RAPPORT-HTML.md).

Une carte par candidat :

- **Fichiers** : les modules en cause ;
- **Problème** : pourquoi l'architecture actuelle frotte ;
- **Solution** : ce qui changerait, en clair ;
- **Gains** : en termes de localité et de levier, et ce que deviennent les tests ;
- **Avant / après** : côte à côte, dessinés pour montrer la superficialité puis l'approfondissement ;
- **Force de la recommandation** : `Forte`, `À explorer` ou `Spéculative`.

Finir par **la recommandation principale** : le candidat à traiter d'abord, et pourquoi.

**Conflits d'ADR** : ne signaler un candidat qui contredit un ADR que si la friction justifie de rouvrir l'ADR, et le
marquer clairement dans la carte (*« contredit ADR-0006, mais mérite d'être rouvert parce que… »*). Ne pas lister
toutes les refactorisations théoriques qu'un ADR interdit.

Ne pas encore proposer d'interfaces. Une fois le fichier écrit, demander : « Lequel de ces candidats veux-tu
explorer ? »

## 3. Interroger sur le candidat choisi

Le porteur choisit un candidat : suivre `.agent/skills/grilling/SKILL.md` pour parcourir avec lui l'arbre de
décisions — contraintes, dépendances, forme du module approfondi, ce qui passe derrière la couture, quels tests
survivent. Suivre en même temps `.agent/skills/domain-modeling/SKILL.md` pour tenir le modèle du domaine à jour :

- **Un module approfondi prend le nom d'un concept absent du glossaire ?** Ajouter le terme à `docs/glossaire.md`.
- **Un terme flou s'affûte pendant la discussion ?** Mettre à jour `docs/glossaire.md` sur-le-champ.
- **Le porteur rejette le candidat pour une raison qui porte ?** Proposer un ADR : *« Veux-tu que je l'écrive en ADR,
  pour que les prochains relevés ne le reproposent pas ? »* — seulement si un futur relevé aurait besoin de cette
  raison pour ne pas reproposer la même chose ; pas pour « pas maintenant », ni pour l'évident.
- **On veut comparer plusieurs interfaces pour le module approfondi ?** Suivre « Concevoir deux fois » dans
  [VOCABULAIRE-DE-CONCEPTION.md](VOCABULAIRE-DE-CONCEPTION.md).

## 4. Ce qui sort de la séance

- Un approfondissement retenu devient **un ticket** par `/write-spec` — en expand–contract s'il touche beaucoup
  d'appelants —, et **un ADR avant l'implémentation** s'il est structurel (critères de `domain-modeling`).
- Rien n'est refactorisé dans la séance sans que le porteur le demande.
