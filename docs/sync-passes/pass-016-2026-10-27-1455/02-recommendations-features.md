# Passe 016 — Recommandations pour `docs/features.md`

**Cinq recommandations nouvelles : FE1 à FE5.** FD1 (015) est soldée, comme FA1, FA3 et FB8 (013).
Restent ouvertes, et ne sont pas répétées :

- FD2 (015, facultative) : [texte intégral](../pass-015-2026-10-19-2229/02-recommendations-features.md) ;
- FB1, FA2, FA4 → FA7, FB2 → FB7, FB9 (013) : [texte intégral](../pass-013-2026-10-14-1023/02-recommendations-features.md).

Leurs numéros de ligne ont bougé. FB1, les notifications push, vise désormais la **l.559** ; FB2
(« en temps réel ») la l.281 ; FB9 (rôles prédéfinis) la l.537.

| ID | Ligne | Objet | Nature | Priorité |
|----|-------|-------|--------|----------|
| FE1 | §2.11 l.751 | Plafonds global et par agence : configuration, pas console | Correction factuelle, avec une alternative produit | Moyenne |
| FE2 | §2.11, règles | Le contenu externe : aucun outil, sortie structurée, bloc délimité | Correction factuelle | Basse |
| FE3 | §1.7 l.283 | « La règle n'est pas appliquée » : elle l'est depuis TCK-2191 | Correction factuelle | **Moyenne** — la ligne dit faux |
| FE4 | §1.5 | La reprise au bailleur et le `Payout` constaté n'ont aucune ligne | Ajout factuel (code fusionné) | Moyenne |
| FE5 | §1.5, §2.2, §2.9 | Quatre comportements livrés sans ligne | Ajout factuel, facultatif | Basse |

---

#### FE1 — l.751 : où se règlent les plafonds

**Constat.** La ligne « Budgets (global journalier, par usage, par agence) et coupe-circuit par
usage » est rangée parmi les gestes de la console super-admin. Dans le code fusionné :

- le plafond **par usage** et le coupe-circuit se règlent depuis la console (`ai_usage_settings`,
  `models-spec.md` §103) ;
- les plafonds **global journalier** et **par agence** ne se règlent que par la configuration
  (`ai.budgets.daily_global_xof`, `ai.budgets.daily_per_agency_xof`), lus par `AiBudget`.

ADR-0076 n'annonce d'ailleurs en console que « budgets et coupe-circuits par usage
(`ai_usage_settings`) ».

**Proposition — au choix du porteur :**

- **(a) Dire l'état (recommandée).** Remplacer la ligne par : « Plafonds journaliers en XOF : par
  usage, réglable depuis la console avec le coupe-circuit de l'usage ; global et par agence, fixés
  par la configuration du déploiement. Un appel d'évaluation n'y compte pas (TCK-2383) ».
- **(b) Garder la cible.** La ligne reste telle quelle, et un ticket rend les deux plafonds réglables
  en console. **C'est une décision produit.** Tant qu'il n'est pas livré, la ligne reste ⚠️.

#### FE2 — §2.11, règle « un contenu externe est une donnée »

**Constat.** La règle écrit « l'usage qui le lit n'a aucun outil d'écriture ». Le code est plus
strict (TCK-2398, `ExternalContentPolicy`, tenu en CI sur le catalogue réel) :

- un tel usage n'a **aucun** outil, pas même de lecture. Les compétences du SDK comptent comme un
  outil ;
- il ne rend qu'une **sortie structurée** ;
- le contenu arrive au modèle dans un **bloc délimité**, dont la balise n'est pas prévisible, et
  toute balise de ce nom écrite dans le contenu est neutralisée.

**Proposition.** « Un contenu externe est une donnée, jamais une consigne : il arrive au modèle dans
un bloc délimité, et l'usage qui le lit n'a aucun outil et ne rend qu'une sortie structurée
(TCK-2398) ».

#### FE3 — l.283 : le groupe rattaché à un bail

**Constat.** La ligne se termine par « ⚠ Au 2026-10-23, la règle n'est pas appliquée :
`GuardsConversationScope` ne juge face au bail que l'acteur ». Depuis TCK-2191 (`d96e36f4a`),
`GuardsConversationScope::guardLeaseReaders()` refuse tout participant qui ne lit pas le bail, à la
création et à l'ajout. Seule exception : le prestataire assigné, dans le fil de son intervention.
C'est exactement la règle que la ligne décrit.

**Proposition.** Retirer la phrase « ⚠ Au 2026-10-23… », et ajouter TCK-2191 aux références de la
ligne.

#### FE4 — §1.5 : la reprise au bailleur et le remboursement déjà sorti

**Constat.** ADR-0039, amendé les 2026-10-23 et 2026-10-24, est livré :

- **le `Payout` constaté** (TCK-2052) : le remboursement d'un acompte ou d'un loyer déjà sorti
  donne un `Payout` qui désigne le payable remboursé ;
- **la reprise au bailleur** (TCK-2151) : rembourser une part déjà reversée crée une reprise au net
  de commission. Elle est imputée au reversement suivant du même bailleur, avec report du reliquat,
  et peut se solder à la main ;
- **la copie figée de chaque ligne** du reversement (TCK-2017) : le relevé ne suit plus le taux
  d'agence du jour ;
- **la pénalité de retard réglée**, ligne propre du reversement (P206.01), et la part de pénalité
  rendue par un remboursement (P206.04).

Aucune ligne de §1.5 n'en parle. La l.221 dit « un paiement n'est reversé qu'une fois », ce qui
reste vrai, mais ne dit pas ce qui arrive quand ce paiement est remboursé après coup.

**Proposition.** Ajouter après la l.222 :

« P1 | 🏢🏠 | Remboursement d'une somme déjà reversée au bailleur : le remboursement est constaté
comme une sortie d'argent, et la part du bailleur, au net de commission, est reprise sur son
reversement suivant, reliquat reporté, ou soldée à la main ; chaque ligne d'un reversement garde le
montant, le taux et la commission appliqués à sa création (TCK-2017, TCK-2052, TCK-2151,
ADR-0039 — lien vers `adr/0039-les-sorties-d-argent.md`) ».

Et compléter la l.221 : « … pénalités (la pénalité réglée est une ligne propre du reversement,
P206.01) … ».

#### FE5 — Quatre comportements livrés sans ligne (facultatif)

Chacun est fusionné avec ses tests, et décrit dans le schéma par ME8, ME7, ME10 et ME11. Aucun ne
rend une ligne fausse ; ils rendent le catalogue incomplet.

- **l.232, relevés** (TCK-1919, décision du porteur « marquer, ne pas sauter ») : ajouter « une
  ligne qui reprend une transaction déjà importée est marquée en doublon de la première, pas
  ignorée ».
- **l.233, rapprochement** (TCK-1421) : ajouter « ; le virement de clôture de la plateforme se
  rapproche d'un crédit du relevé ».
- **l.683, référentiel géographique** (TCK-1080, TCK-1169) : ajouter « ; un ancien nom continue de
  désigner le quartier ou la ville renommé dans la recherche, les alertes et le rapprochement CRM ».
- **l.517, rappel d'invitation** (TCK-2155) : « rappel automatique J+2 » devient « rappel automatique
  J+2, retenté le lendemain si tous les fournisseurs SMS l'ont refusé, trois essais au plus ».

---

**Sans recommandation, dit explicitement :**

- **§2.12 Radar** : rien à changer. Les 14 lignes décrivent une cible décidée (ADR-0077), et c'est le
  rôle du catalogue. Elles sont comptées ⚠️ justifiées jusqu'à la fusion de leurs tickets.
- **La file `long` et le `worker-long`** (ADR-0078, TCK-2397, TCK-2401) : aucune fonctionnalité ne
  l'exige. La l.695 dit « âge de la file, battement des workers » sans nommer de file, et reste vraie.
