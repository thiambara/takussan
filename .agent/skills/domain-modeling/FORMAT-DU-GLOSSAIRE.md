# Format de `docs/glossaire.md`

Adapté du `GLOSSARY-FORMAT.md` de `mattpocock/skills` (v1.3.2, MIT). Un seul contexte : Takussan est un seul domaine,
la gestion immobilière, même si l'API et le front sont deux applications.

## Une entrée

```md
**Profil** :
Ce qui fait le rôle d'une personne dans une **Agence** : un rôle est l'existence d'un profil actif, jamais une
permission attachée au compte. ([ADR-0002](adr/0002-role-est-un-profil-polymorphe.md))
_Dans le code_ : `app/Models/Profiles/` — `OwnerProfile`, `AgentProfile`, …
_À éviter_ : rôle (au sens d'une permission), permission.
```

- **La source entre parenthèses** : l'ADR (ou, à défaut, le fichier du code) qui fixe le terme. Une ligne
  *À éviter* s'appuie sur la même source : on n'interdit pas un mot que le dépôt emploie lui-même.
- **Le terme en gras, suivi de deux-points**, puis la définition à la ligne.
- **_Dans le code_** (facultatif) : l'identifiant anglais qui porte ce concept — classe, table, colonne, cas d'enum.
  C'est l'écart délibéré à l'original (ADR-0137) : le domaine se parle en français et se code en anglais, et la
  dérive naît à ce passage. Rien d'autre du code n'entre au glossaire.
- **_À éviter_** : les synonymes à ne plus employer pour ce concept, y compris les faux amis anglais du code.

## Les règles

- **Trancher.** Quand plusieurs mots désignent le même concept, choisir le meilleur et lister les autres sous
  *À éviter*.
- **Définitions serrées.** Une ou deux phrases. Dire ce que la chose **est**, pas ce qu'elle fait.
- **Mettre en gras les autres termes du glossaire** cités dans une définition (`**Agence**`), et laisser la phrase dire
  comment les deux se rapportent.
- **Seulement les termes propres à ce domaine.** Les notions générales de programmation (délai, erreur, cache,
  pagination) n'y entrent pas, même si le code en est plein. Avant d'ajouter un terme : est-il propre à la gestion
  immobilière de Takussan, ou général ? Seul le premier entre.
- **Regrouper sous des sous-titres** quand des familles se dessinent (les acteurs, le bien, le bail, l'argent…). Une
  liste plate suffit tant qu'il n'y en a pas.
- **Un terme retiré du produit** (le courtier, ADR-0030) va dans la section *Termes retirés*, avec l'ADR qui l'a
  retiré — pour qu'aucun agent ne le réintroduise en le croyant oublié.
- **Le wolof est en pause** : le glossaire ne porte pas de traduction.
