# ADR-0104 — L'identité légale de l'agence n'a qu'une source, ses colonnes ; la vérification et le passage en pro la reprennent, rien ne l'écrit en silence

- **Statut** : Accepté le 2026-11-10 par le porteur (approche A de la page Identité, « une seule saisie de l'identité légale » ; décision n° 14 (a) pour le prix) — modalités : décisions de la session, à revoir ; § 6 décidé par le porteur le 2026-11-10 (l'approbation pose l'abonnement, TCK-2681)
- **Date** : 2026-11-10
- **Tickets** : TCK-2669 (API : numéros des pièces, pièce remplaçable, demande reprise, prix de l'offre), TCK-2670 (fiche agence : sommaire, complétude), TCK-2671 (vérification, offre, passage en pro), TCK-2681 (l'approbation pose l'abonnement)
- **S'appuie sur** : [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md) (chiffrement, masquage)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10, audit UX famille 6 ([`06-agence.md`](../qa/audit-ux-2026-11/06-agence.md)) :

- **La même identité légale se saisit trois fois, sous trois vocabulaires** :
  - les **mentions légales** de la fiche : `agencies.legal_name`, `ninea`, `rccm`, `legal_address`, écrites par `PATCH /api/agencies/{agency}` ;
  - le **dossier de vérification** (`kyc_dossiers`) : des **fichiers seulement**, sans aucun numéro ;
  - la **demande de passage en pro** (`agency_upgrade_requests`) : `rc`, `ninea`, `rib_pro`, `company_legal_name`, `address_fiscale`. Ces champs sont recopiés vers l'agence à l'approbation, **seulement si le champ de l'agence est vide** (`AgencyKindFlipService`).
- « RCCM » et « RC », « adresse du siège » et « adresse fiscale » : deux mots pour une chose, et deux choses sous un mot.
- **Une demande refusée ne se reprend pas** : NINEA et RIB sont masqués à la lecture (TCK-601), et il faut tout retaper.
- **Une pièce vérifiée ne se renouvelle pas** pendant les relances de J-30 et J-7 : `kyc.locked` refuse tout envoi sur un dossier `verified`.
- **L'approbation d'un passage en pro ne pose aucun abonnement ni plan** (`AgencyUpgradeReviewService`). La page affiche pourtant un prix (`monthly_price_xof`).

## Décision

**Les colonnes `agencies.*` sont la seule source de l'identité légale. La vérification et le passage en pro les reprennent pour préremplir. Une pièce porte son propre numéro, qui n'écrase jamais l'agence. Toute reprise d'une pièce vers les mentions est un geste explicite de l'admin.**

1. **Une source.** La raison sociale, le RCCM, le NINEA et l'adresse du siège vivent dans `agencies.*`, et nulle part ailleurs comme vérité. Les autres saisies sont des **copies datées**, liées à l'acte qui les a demandées (une pièce, une demande).
2. **La reprise.**
   - Le dossier de vérification et la demande de passage se **préremplissent** depuis l'agence.
   - Les pièces RCCM et NINEA **portent leur numéro**, saisi avec la pièce, qui n'écrase jamais l'agence.
   - Si les deux diffèrent, l'écran le montre et offre « Reprendre ces deux numéros », le seul chemin de la pièce vers les mentions.
3. **Pas d'écriture croisée silencieuse.** La recopie « si vide » à l'approbation (`AgencyKindFlipService`) devient la même reprise explicite. À défaut d'un geste de l'admin, l'agence garde ses colonnes.
4. **Un mot par chose.**
   - « RCCM » est le seul mot de l'écran. La colonne `rc` de la demande garde son nom en base.
   - L'**adresse fiscale** reste un champ distinct de l'adresse du siège, préremplie par elle.
5. **Une demande refusée se reprend.**
   - `resubmit_of` désigne la dernière demande `rejected` de la même agence.
   - Les numéros masqués, NINEA et RIB, sont **repris côté serveur**, jamais renvoyés en clair au navigateur.
   - Les statuts sont toujours fournis à nouveau.
6. **Le prix affiché au passage en pro.**
   - Le prix se lit de l'API, en F CFA (décision n° 14 (a)), et n'est jamais écrit dans le code. C'est celui du plan que l'approbation **donnera**.
   - Tant que l'approbation n'en pose aucun, ce plan est désigné par configuration (`billing.upgrade_plan_code`, défaut `pro`).
   - **Décidé par le porteur le 2026-11-10** : l'approbation d'un passage en pro **pose l'abonnement** à ce plan (`AgencySubscriptionService::assign`, dans la transaction de l'approbation), sous le geste du super-admin qui approuve, sans prélèvement automatique ([TCK-2681](../backlog/tickets/todo/TCK-2681-approbation-pro-pose-l-abonnement.md)).
   - Le prix est celui du plan (`plans.monthly_price_xof`) : l'abonnement n'a pas de colonne de prix, et un prix de plan changé vaut pour tous ses abonnés, comme aujourd'hui. Figer le prix à l'approbation serait une autre décision.
   - Tant que TCK-2681 n'est pas livré, l'écran n'écrit aucune promesse que le produit ne tient pas : ni « sans engagement », ni « le premier mois n'est facturé qu'après l'acceptation ».
7. **Le renouvellement d'une pièce.**
   - Sur un dossier vérifié, la pièce du dirigeant **expirée ou expirant sous 30 jours** se remplace. Le dossier passe `submitted`, et `agencies.is_verified` reste vrai jusqu'à l'échéance de l'ancienne pièce.
   - Le contrôle de forme du NINEA et du RCCM reste différé (dette D-68).

## Conséquences

- **L'identité affichée sur une facture, un contrat ou la fiche publique est toujours celle des colonnes.** Une pièce envoyée avec un numéro différent ne change rien tant que l'admin ne l'a pas repris.
- **Le super-admin qui vérifie voit les deux numéros**, celui de la pièce et celui de l'agence, et leur écart.
- Les numéros des pièces sont des identifiants d'entreprise, pas des données personnelles sensibles au sens d'[ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md) : ils suivent la règle des colonnes `agencies.ninea` et `rccm`, rendues en clair à qui voit la fiche. Le RIB reste chiffré et masqué.
- `docs/models-spec.md` gagne les numéros des pièces et `resubmit_of`.

## Options écartées

- **La pièce fait foi et écrase l'agence** : une pièce mal saisie corrompt les mentions légales, sans que personne l'ait voulu.
- **Supprimer la saisie dans la demande de passage** et ne lire que l'agence : une agence `individual` n'a pas de mentions légales (`prohibited` sur sa fiche). La demande est le seul endroit où elle les donne avant de devenir `standard`.
- **Garder la recopie « si vide »** : elle écrit en silence. Une agence qui avait un RCCM ancien garde l'ancien, une agence sans RCCM reçoit celui de la demande, et personne ne le sait.

## Application

- `kyc_dossiers` : numéro par pièce, renouvellement permis dans la fenêtre. `agency_upgrade_requests.resubmit_of`, reprise serveur des champs masqués. `GET /api/me/upgrade-offer`. `AgencyKindFlipService` sans recopie implicite.
- Gardes (TCK-2669) :
  - « une pièce au numéro différent n'écrase pas l'agence » ;
  - « une demande reprise sans NINEA ni RIB les garde » ;
  - « renouvellement permis sur un dossier vérifié qui expire » ;
  - « prix lu de l'API ».
