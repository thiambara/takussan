# ADR-0103 — Le pilotage commercial se dérive des gestes et des faits : premier contact daté, relance due calculée, étape proposée et jamais imposée

- **Statut** : Accepté le 2026-11-10 (décision n° 11 (a) : *Takussan propose l'étape suivante, l'agent confirme* ; décisions 3 (b) et 7 (a) de la famille 5, validées par le porteur) — modalités : décisions de la session, à revoir
- **Date** : 2026-11-10
- **Tickets** : TCK-2583 (gestes de contact, première réponse, délai par agent), TCK-2584 (demandes en boîte de réception), TCK-2588 (prochaine action, relance due), TCK-2591 (pipeline : indicateurs justes, étape proposée), TCK-2592 (pipeline : relances, colonnes), TCK-2596 (« Aujourd'hui »)
- **Va avec** : [ADR-0101](0101-le-fil-commercial-vit-dans-la-fiche-client.md) (le compte rendu, premier fait qui propose une étape)

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10 :

- **Aucune donnée de délai.**
  - Une demande n'a que `handled_at` : pas d'heure de première réponse.
  - Une fiche client n'a pas de dernier contact.
  - Le journal d'activité ne trace ni appel ni WhatsApp.
  - Le taux de conversion du pipeline lit `updated_at`, que toute modification déplace.
- **Le pipeline est saisi à la main**, et rien ne dit qui relancer.
- La boîte des demandes construit le lien `wa.me` à la main (`ContactLeadsInbox.tsx:184-185`) au lieu de l'aide partagée.
- Les passages d'étape sont déjà journalisés (`attribute_changes`, P56.01).

Décisions retenues :
- 3 (b) : *répondre ne vaut pas traiter, la console demande au retour* ;
- 7 (a) : *le délai de première réponse est montré à l'admin, par agent* ;
- 11 (a) : *Takussan propose l'étape suivante, l'agent confirme ; vocabulaire en français*.

## Décision

**Les indicateurs commerciaux se calculent sur des faits datés : les gestes de contact faits depuis la console, et le journal des étapes. Une relance due et une étape proposée sont calculées ; aucune n'est écrite sans l'agent.**

1. **Le geste de contact est journalisé et dénormalisé par un seul service.**
   - Un appel, un WhatsApp, un e-mail ou un SMS lancé depuis la console écrit une entrée du journal d'activité (`contacted`, avec le **canal seul**, sans coordonnée).
   - Il pose `first_responded_at`, l'auteur et le canal au **premier** geste sur une demande. Ce geste est idempotent : le second ne déplace rien.
   - Il avance `last_contacted_at` sur la fiche client. Une note, une visite terminée et un compte rendu l'avancent aussi.
2. **Le geste mesuré est l'ouverture de l'application externe, pas l'envoi.** Takussan ne voit pas si l'appel a abouti ni si le message est parti. C'est une limite **assumée**, et aucun écran ne doit prétendre le contraire (« contacté » et non « joint »).
3. **Répondre ne vaut pas traiter.** Un geste ne pose pas `handled_at`. « Traitée » reste un geste explicite (marquer, convertir, planifier une visite). Au retour dans la console, l'écran demande si la demande est traitée.
4. **La relance due** a trois sources :
   - une tâche échue ;
   - un compte rendu de visite manquant (« À clore », [ADR-0101](0101-le-fil-commercial-vit-dans-la-fiche-client.md) § 6) ;
   - une fiche d'une étape vivante sans contact depuis `crm.follow_up_days` jours.

   La valeur par défaut est **7** (décidée par le porteur le 2026-11-10), un réglage. Quand plusieurs raisons existent, **la plus ancienne l'emporte**, et les relances se trient par retard. La relance est calculée à la lecture et n'est jamais stockée.
5. **L'étape proposée** se déduit du dernier fait postérieur au dernier changement d'étape :

   | Fait | Étape proposée |
   |---|---|
   | visite confirmée | Prospect |
   | compte rendu « intéressé » | Qualifié |
   | candidature ou offre | Négociation |
   | bail signé | Gagné |

   La proposition n'est **jamais automatique**, jamais vers « Perdu », jamais en arrière. **Une proposition écartée ne revient pas pour le même fait.** Le refus est tracé sur le fait, et un fait nouveau peut proposer à nouveau.
6. **Les indicateurs du pipeline se calculent sur le journal des étapes** (`attribute_changes`), jamais sur `updated_at`. Une conversion est un passage daté d'une étape à une autre.
7. **Le délai de première réponse par agent est une donnée de management.** Il est lu sous `crm.view_all` seulement. Un agent sans cette capacité ne lit jamais le délai de ses collègues. La mesure est calendaire et rendue brute : la présentation est au front.
8. **Le vocabulaire des étapes est français à l'écran** : Prospect, Qualifié, Négociation, Gagné, Perdu. Les codes de l'API ne changent pas (principe 5).

## Conséquences

- **Deux colonnes dénormalisées** (`first_responded_*` sur la demande, `last_contacted_at` sur la fiche) sont tenues par **un seul service**. Tout autre chemin qui les écrirait est un défaut.
- **Le délai se mesure depuis la console seulement.** Un agent qui répond depuis son téléphone personnel, hors Takussan, n'a pas de première réponse. L'indicateur sous-estime donc la réactivité de qui travaille hors de l'outil, et l'écran le dit.
- **Les tâches nées du métier** (« les tâches naissent du métier », ambition de l'audit) **ne sont pas décidées ici.** Une tâche automatique demanderait son propre ADR.
- Le seuil `crm.follow_up_days` entre au catalogue des réglages ([ADR-0065](0065-les-reglages-metier-a-repli-global-entrent-au-catalogue.md)) s'il doit varier par agence. Sinon, il reste en configuration.

## Options écartées

- **L'étape avancée automatiquement** : un pipeline qui bouge seul n'est plus cru. Écarté par la décision 11 (a).
- **Le geste qui vaut traitement** : une demande « traitée » dès qu'on a ouvert WhatsApp sortirait de la boîte avant d'avoir une réponse. Écarté par la décision 3 (b).
- **Mesurer l'envoi effectif**, par l'API WhatsApp : un numéro d'agence configuré, un coût par message et une intégration que le produit n'a pas (le Radar a la sienne, pour un autre usage, [ADR-0081](0081-le-radar-prospecte-par-l-api-whatsapp-sur-son-propre-numero.md)).
- **Stocker la relance due** : un état à recalculer à chaque tâche, note ou visite, alors qu'il se dérive à la lecture.

## Application

- `ContactGestureService`. Migrations `add_first_response_to_property_contact_leads` et `add_last_contacted_at_to_customers`. Routes `contact-leads/{lead}/contacts`, `customers/{customer}/contacts` et `contact-leads/response-stats`.
- Pipeline : les indicateurs sont relus sur `attribute_changes`, et l'étape proposée est calculée (TCK-2591).
- Gardes :
  - `ContactGestureTest` : le premier geste pose, le second ne déplace pas, `handled_at` reste inchangé ;
  - `ContactLeadResponseStatsTest` : médiane connue, 403 sans `crm.view_all` ;
  - un test de l'étape proposée par fait, refus compris ;
  - un test « le taux de conversion ignore `updated_at` », vérifié par ablation.
