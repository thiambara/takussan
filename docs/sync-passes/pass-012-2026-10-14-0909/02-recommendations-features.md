# 02 — Recommandations à `features.md`

> Passe 012 — 2026-10-14 09:09. Conventions et limites : `00-summary.md`.
> Les numéros de ligne renvoient à `docs/features.md` (sha1 `291afd30`, 724 lignes) ; les « § » et
> « l. » de spec à `docs/models-spec.md` (sha1 `0c720866`, 4417 lignes). Migrations citées par leur
> nom de fichier, dans `takussan-api/database/migrations/`.
> Le versant features n'a **aucun ❌**. Les 67 ⚠️ par dérive se résorbent dans `models-spec.md`
> (`03-…`), pas ici. Ce fichier ne porte que ce que le catalogue lui-même dit de faux, de périmé ou
> d'ambigu — **16 recommandations** : les 13 de la passe 011, aucune appliquée, et 3 nouvelles.

---

## A. F1 à F13 — reprises de la passe 011, aucune appliquée

Le texte intégral de chaque recommandation (constat, proposition) est dans
[`pass-011-2026-10-08-2221/02-recommendations-features.md`](../pass-011-2026-10-08-2221/02-recommendations-features.md) :
il reste juste, seules ses lignes ont glissé. Ce tableau donne l'état mesuré à HEAD et les nouveaux
numéros de ligne. Deux sont **aggravées** par le delta.

| Reco | Ancienne ligne | Ligne HEAD | Statut | Mesure / remarque |
|---|---|---|---|---|
| **F1** — note courtier §2.1 « vivent en base » | 472 | **480** `[=]` | ❌ non appliquée | La note dit toujours « `BrokerProfile` et `BrokerAgencyCollaboration` restent décrits par `models-spec.md` et vivent en base » et « license_number par AgentProfile/BrokerProfile ». `grep -c "ADR-0030"` = **0** dans les deux documents. Les tables restent supprimées (`2026_10_07_090100_drop_broker_tables` présente, aucun modèle courtier). |
| **F2** — en-tête « les 28 modèles » | 5 | **5** `[=]` | ❌ non appliquée — **aggravée** | La spec compte désormais **97** sections (TCK-633 en a ajouté 10). |
| **F3** — §2.2 « le mécanisme reste à concevoir » | 518 | **527** `[=]` | ❌ non appliquée | Texte identique. Les tables `agency_roles`/`agency_role_capabilities` existent toujours (`2026_08_16_120000`, `120100`, `120400`, `2026_08_17_090000`-`090200`). |
| **F4** — §1.1 « permissions granulaires » d'un collaborateur | 84 | **89** `[=]` | ❌ non appliquée | Aucune colonne `permissions` dans `2026_04_17_160008_create_property_collaborators_table`. |
| **F5** — ligne « agent principal » (TCK-504) + définition de « l'agent responsable » | 86, 96, 425 | **91, 101, 432** `[=]` | ❌ non appliquée — **aggravée** | `grep -n "is_primary\|TCK-504\|TCK-603\|ADR-0053\|ADR-0036" features.md` : 0 résultat. TCK-633 ajoute deux lignes qui s'appuient sur la notion sans la nommer : l.**85** (« révélés au même geste que le numéro **principal** ») et l.**86** (« prénom et numéro vérifié du **contact principal** ») ; s'y ajoute l.163 (TCK-590, « routée vers le contact principal du bien »), déjà présente. Quatre lignes désormais dépendent d'une notion que le catalogue ne définit pas. |
| **F6** — règle de joignabilité (TCK-565) | 262 (et 267) | **268** (et 273) `[=]` | ❌ non appliquée | `grep "TCK-565"` : 0. ⚠ TCK-633 introduit « joignable » dans un **autre** sens (l.86 « Publier exige un contact joignable » ; l.127 « le contact affiché est une personne joignable ») : à l'application de F6, nommer la règle de messagerie pour ne pas la confondre avec la condition de publication. |
| **F7** — §2.9 webhook par intégration (TCK-293) | 660 | **671** `[=]` | ❌ non appliquée | `grep "TCK-293\|ADR-0046"` : 0. |
| **F8** — §1.4 « Espace locataire dédié » P3 | 195 (et 578-580, 186, 192, 281) | **201** (et 587-589, 192, 198, 287) | ❌ non appliquée | Inchangée. |
| **F9** — §1.5 « Commissions automatiques » P3 | 227-228 | **233-234** `[=]` | ❌ non appliquée | Inchangées. |
| **F10** — §2.3 WhatsApp P3 et intertitre « (P3) » | 540, 542 (et 534) | **549, 551** (et 543) `[=]` | ❌ non appliquée | Inchangées. |
| **F11** — §1.7 accusés de lecture P2 | 268 | **274** `[=]` | ❌ non appliquée | EF5 toujours « refusé » (models-spec l.4383). |
| **F12** — §1.10 « Signature électronique intégrée » P3 | 362 (et 194) | **368** (et 200) `[=]` | ❌ non appliquée | Inchangée. |
| **F13** — §1.12 « Absence datée d'un agent » P3 | 433 | **440** `[=]` | ❌ non appliquée | Inchangée ; `role_delegations.replaces_user_id` (`2026_10_07_591400`) existe toujours. |

**F5 se lit désormais avec F16** : quatre lignes s'appuient sur « le contact / l'agent principal »
(l.85, 86, 91, 163) sans que le catalogue le définisse.

**F6, à l'application** : TCK-633 introduit « joignable » dans un autre sens (l.86 « Publier exige un
contact joignable », l.127 « une personne joignable ») — nommer la règle de messagerie de TCK-565 pour ne
pas la confondre avec la condition de publication.

---

## B. Nouvelles — nées du delta TCK-633 / TCK-635

### F14 — §1.12 l.426 : le sens du drapeau `host_auto_space`
**Constat.** La ligne écrit « Le wizard reste, derrière le drapeau `host_auto_space` éteint ». Mesuré :
le drapeau porte la **création automatique** (`HostAutoOnboardController` : éteint → 403
`onboarding.auto_space_disabled`, le front reprend le wizard), et `2026_10_12_300000_enable_host_auto_space_flag`
le pose **allumé** (`insertOrIgnore` : une ligne réglée par un opérateur est gardée). La phrase se lit
aussi « le wizard est derrière un drapeau éteint », qui est l'inverse.
**Proposition.** Remplacer la dernière phrase par : « La création automatique est portée par le drapeau
`host_auto_space`, allumé à l'installation ; l'éteindre rend le wizard (TCK-633). »

### F15 — §1.2 l.115 : le départage des villes homonymes (TCK-635, ADR-0062 §8)
**Constat.** TCK-635 (`done`, fusionné depuis la passe 011 : `17fe11c6`, `93f23ac0`) départage deux villes du même nom
par leur région : `region` entre dans le document de recherche (`Property::toSearchableArray()`), la
liste et la carte acceptent un paramètre `region`, et le filtre Ville ne propose une homonyme qu'une
fois. Ses `spec_refs` visent §1.2 ; `features.md` ne cite TCK-635 nulle part.
**Proposition.** Ajouter à l.115, après « ville et quartier se choisissent dans le référentiel » :
« deux villes du même nom se distinguent par leur région (TCK-635, ADR-0062 §8) ». La « robe » des
biens en vedette (même ticket) peut rejoindre l.116 si l'on veut la tracer ; elle est de présentation
et n'appelle aucune donnée.

### F16 — §1.1 l.86 : nommer « le contact principal »
**Constat.** La ligne exige « prénom et numéro vérifié du contact principal ». `PublishReadiness` le
juge sur `PrimaryPropertyContact` : l'agent **désigné** (`property_collaborators.is_primary`, TCK-504),
à défaut l'agent éligible le plus anciennement invité, à défaut le titulaire du bien ; les CGU se jugent
sur le **publieur**. Le catalogue ne dit nulle part ce qu'est le contact principal (c'est le manque F5
de la passe 011).
**Proposition.** Écrire « prénom et numéro vérifié de la personne que les visiteurs appelleront —
l'agent principal du bien, à défaut son titulaire — ; les CGU sont acceptées par le publieur ». À
appliquer avec F5, pas avant.

---

## Résumé des actions

| ID | Section | Action | Priorité |
|----|---------|--------|----------|
| F1 | §2.1 note (l.480) | Le courtier a quitté la base (ADR-0030) | Haute — faux |
| F2 | En-tête (l.5) | Retirer « 28 modèles » (97 sections) | Haute — faux, aggravé |
| F3 | §2.2 l.527 | Les rôles personnalisés existent | Haute — faux |
| F4 | §1.1 l.89 | « Permissions granulaires » d'un collaborateur | Moyenne |
| F5 | §1.1, §1.12 (l.91, 101, 432) | Définir l'agent principal (TCK-504) | Haute — aggravé |
| F6 | §1.7 l.268 | Règle de joignabilité (TCK-565) | Moyenne |
| F7 | §2.9 l.671 | Webhook par intégration (TCK-293) | Moyenne |
| F8 | §1.4 l.201 | « Espace locataire dédié » à reclasser | Basse |
| F9 | §1.5 l.233-234 | Commissions automatiques P3 | Basse |
| F10 | §2.3 l.549, 551 | WhatsApp sortant P3 | Basse |
| F11 | §1.7 l.274 | Accusés de lecture P2 | Basse |
| F12 | §1.10 l.368 | Signature électronique intégrée P3 | Basse |
| F13 | §1.12 l.440 | Absence datée d'un agent | Basse |
| F14 | §1.12 l.426 | Sens du drapeau `host_auto_space` | Moyenne — ambigu, se lit à l'envers |
| F15 | §1.2 l.115 | Villes homonymes départagées par la région (TCK-635) | Basse |
| F16 | §1.1 l.86 | Nommer « le contact principal » — avec F5 | Moyenne |
