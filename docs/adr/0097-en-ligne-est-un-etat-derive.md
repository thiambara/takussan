# ADR-0097 — « En ligne » est un état dérivé, servi par l'API à partir d'un seul prédicat ; « Publié » ne s'affiche plus comme un état dans la gestion

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 6 (a) : *« Publié » réservé à « En ligne », visible du public*) — modalités : décisions de la session, à revoir ; § 4, § 5 et § 6 décidés par le porteur le 2026-11-10 (« Validé », motif hors ligne par TCK-2678, quota inchangé)
- **Date** : 2026-11-10
- **Tickets** : TCK-2637 (API : `is_online`, occupation), TCK-2638 (liste des biens), TCK-2639 (fiche du bien), TCK-2678 (motif d'un bien hors ligne)
- **S'appuie sur** : [ADR-0048](0048-effet-d-une-suspension-d-agence.md) (une agence suspendue disparaît du site)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10, audit UX famille 4 ([`04-patrimoine-et-location.md`](../qa/audit-ux-2026-11/04-patrimoine-et-location.md)) :

- Trois notions s'affichent sous des mots qui se recouvrent :
  - le **statut** `PropertyStatus::Published`, une des onze valeurs ;
  - la **visibilité** `PropertyVisibility`, `public` ou `private`. Il n'y a pas de « Réseau » ;
  - la **présence réelle sur le site public**, `Property::scopePublic` (`Property.php:607-624`) : agence active, visibilité publique, `published_at` posé, statut hors `NON_PUBLIC_STATUSES`, hors bien de test.
- `scopePublic` est servi comme **filtre** (`filter[public]`), jamais comme **champ** d'une ligne. Le front ne peut l'afficher qu'en le recopiant.
- La pastille de ligne « Publié » lit **la seule visibilité** (`PropertyList.tsx:577-599`), et la fiche dit « Public ». La tuile « Publiés » compte, elle, `filter[public]=1`. Le même mot recouvre deux mesures.
- Conséquence : un bien privé validé, ou un bien public d'une agence suspendue, se lit à tort.
- Le quota de « biens actifs » (`QuotaResolver`) compte les statuts `available`, `published`, `pending` et `pending_review`, sans regarder la visibilité.

## Décision

**« Visible du public » n'a qu'une définition, `scopePublic`. L'API la sert sur chaque bien sous le nom `is_online`, par le même code. La gestion n'affiche qu'« En ligne » ou « Hors ligne » comme état de présence publique.**

1. **Un seul prédicat, deux usages.**
   - La règle de `scopePublic` est extraite en un seul endroit (`Property::isOnline()` ou équivalent).
   - Elle est lue par le filtre `filter[public]` **et** par le champ `is_online` de la ressource.
   - Elle n'est jamais recopiée, ni dans l'API, ni dans le front.
   - `is_online` se demande comme tout champ (sparse fieldsets, [ADR-0006](0006-lecture-api-par-query-builder.md)).
2. **« En ligne / Hors ligne » est le seul état de présence affiché.** Le mot « Publié » ne s'affiche plus comme un état : ni pastille, ni tuile, ni filtre.
3. **La visibilité devient un réglage**, libellé « Public / Privé ». Elle dit ce que l'agence **demande**. « En ligne » dit ce qui **est**.
4. **Le libellé du statut `published`.** **Décidé par le porteur le 2026-11-10** : « Validé ». C'est le sens du statut dans le cycle de modération : le bien a passé la revue, il peut être en ligne. Le code et la valeur `published` ne changent pas, seul le libellé change. C'est le front qui porte le texte (principe 5).
5. **Le motif d'un bien hors ligne.** Faut-il que la fiche dise *pourquoi* un bien est hors ligne : privé, en attente de validation, agence suspendue, loué, archivé ?
   - **Décidé par le porteur le 2026-11-10** : oui. L'API sert une liste de **codes de motif**, calculée par le **même** prédicat décomposé, jamais déduite par l'écran.
   - Ce n'est pas dans TCK-2637. C'est un ticket à part, [TCK-2678](../backlog/tickets/todo/TCK-2678-motif-d-un-bien-hors-ligne.md), qui ne rouvre pas cet ADR.
6. **Le quota ne change pas dans ce lot.**
   - Il continue de compter les biens « actifs » par statut. L'écran du quota dit ce qu'il compte (« biens actifs : disponibles, validés ou en attente »), au lieu de laisser croire qu'il compte les biens en ligne.
   - Passer à « en ligne » toucherait la facturation des abonnements (famille 6). **Décidé par le porteur le 2026-11-10** : le quota reste inchangé ; le changer demanderait un ADR qui amende celui-ci.

## Conséquences

- Les libellés de statut et de visibilité changent en `fr`, `en` et `wo` (le wolof porte le texte français tel quel). Le § 1.1 de `docs/features.md` est amendé (`spec-delta` de la famille 4).
- **Un bien public d'une agence suspendue se lit « Hors ligne »**, ce qui est vrai ([ADR-0048](0048-effet-d-une-suspension-d-agence.md)). Aujourd'hui, la pastille dit « Publié ».
- Le prédicat extrait sert aussi la tuile « En ligne » du résumé de portefeuille (`portfolio-summary`, TCK-2637). Ses comptes égalent les `meta.total` des listes filtrées.
- Ajouter une condition à la présence publique, par exemple une modération de plateforme, se fait **une fois** et change d'un coup le filtre, le champ, la tuile et l'écran.

## Options écartées

- **Laisser le front recomposer `is_online`** à partir du statut, de la visibilité et de l'agence : une seconde définition, qui dérivera. Le défaut d'aujourd'hui en est l'exemple.
- **Une colonne `is_online` tenue à jour** : un état dénormalisé qui dépend de l'agence (suspension) et du temps (`published_at`). Il faudrait le recalculer à chaque suspension, ce que le prédicat à la lecture fait sans effort.
- **Garder « Publié » comme état** et renommer le statut : le mot reste ambigu tant qu'il nomme deux choses. La décision 6 (a) le réserve à la présence publique, sous le mot « En ligne ».

## Application

- `Property::isOnline()`, et `scopePublic` qui la lit. `is_online` dans `PropertyResource`.
- Garde : `PropertyOnlineFlagTest`. Sur un jeu de biens qui croise le statut, la visibilité, `published_at`, l'agence suspendue et `is_test`, l'ensemble `is_online=true` égale exactement `filter[public]=1`. Le test rougit si l'on retire une condition d'un seul des deux, ce que vérifie une ablation (TCK-2637, AC2).
