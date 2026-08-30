---
id: TCK-475
title: "Le brouillon d'assistant annonce « Progression sauvegardée » quand l'écriture a échoué"
status: review
phase: P2
family: technique
estimate: S
wave: 52
created: 2026-08-29
updated: 2026-08-30
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, wizard, dette]
---

## Objectif utilisateur

Quelqu'un qui remplit un assistant long doit pouvoir croire ce que l'interface lui dit de son
brouillon. Aujourd'hui elle lui dit « sauvegardé » même quand rien ne l'a été — et c'est la
personne qui ferme son onglet en confiance qui paie.

## Le défaut

`takussan-web/src/components/wizard/WizardReprenable.tsx`, l. **134** et **169** : le toast
« Progression sauvegardée » part **sans regarder le résultat de l'écriture**. Un `localStorage`
plein, un navigateur en navigation privée qui refuse le stockage, une requête réseau perdue — le
message est le même.

*Un message de succès qui ne consulte pas le résultat n'est pas un message, c'est une décoration.*

## Contrat de données

Aucun.

## Delta à produire

- [x] Le toast lit le résultat de l'écriture. En cas d'échec : un message qui **dit quoi faire**,
      pas seulement que ça a raté.
- [x] Vérifier les deux sites — ils ne sont pas forcément le même chemin.

## Critères d'acceptation

- [x] **AC1** — écriture en échec (stockage refusé, quota, ou erreur réseau selon le chemin) → le
      toast de succès **ne part pas**, et un message d'échec part.
- [x] **AC2** — écriture réussie → le toast de succès part toujours. *Un correctif qui éteindrait
      les deux passerait un test qui ne regarde que le cas d'échec.*
- [x] **AC3** — les DEUX sites (l. 134 et l. 169) sont couverts, et le test dit lequel il éprouve.
- [x] **AC4** — ablation : rendre l'écriture toujours-réussie du point de vue de l'appelant fait
      rougir AC1.

## Hors périmètre

- La stratégie de reprise du brouillon elle-même.

## Notes d'implémentation

**Quatre affirmations du ticket ont été re-mesurées, et trois ne tenaient pas telles quelles.**

1. **Il n'y a AUCUN `localStorage` sur ce chemin.** Le ticket évoquait « un `localStorage` plein, un
   navigateur en navigation privée qui refuse le stockage ». `grep -rn localStorage` sur
   `src/hooks/useWizardDraft.ts`, `src/components/wizard/` et `src/lib/wizard-drafts.ts` : zéro
   occurrence. La persistance du brouillon est un **PUT réseau** vers le proxy BFF
   `/api/me/wizard-drafts/{key}`. *Le remède écrit dans les messages d'échec est donc celui du
   réseau et de la session, jamais celui du quota de stockage* — un libellé qui aurait parlé de
   navigation privée aurait envoyé la personne chercher au mauvais endroit.

2. **Les deux sites ne sont pas le même chemin, et le second n'annonçait pas un succès faux — il
   n'annonçait RIEN.** Les numéros du ticket (l. 134 et 169, relevés le 2026-08-29) désignaient les
   deux appels à `flush()`, et non deux toasts : le fichier n'en portait qu'un seul.

   | Site | Ligne au 2026-08-29 | Ligne avant correctif (2026-08-30) | Ce qu'il faisait |
   |---|---|---|---|
   | 1 — nettoyage de l'effet `[hydrated]` (démontage / `pagehide`) | 134 | 134 (`void flush().then(…)`), toast l. 139 | annonçait « Progression sauvegardée » **sans lire** le sort du PUT |
   | 2 — `handleNext`, dernière étape | 169 | 169 (`await flush()`) | **aucun toast** ; l'échec enchaînait sur `onComplete` puis sur `clear()`, qui SUPPRIME le brouillon serveur |

   Le fichier n'avait pas bougé depuis le relevé (`git log` : dernier commit `89233baa`, TCK-316),
   les deux numéros étaient donc encore justes — mais ils ne pointaient pas ce que la phrase disait.

3. **La plomberie existait déjà : c'est TCK-465 qui l'a posée.** `flush()` rend
   `ResultatEcritureBrouillon` (`{ ok, ecrit }`) depuis ce ticket-là ; `WizardReprenable` était le
   consommateur qui jetait ce résultat. Le delta n'est donc **pas** de rendre l'échec observable
   — il l'était — mais de le **lire**. `useWizardDraft` est partagé (PropertyWizard,
   UpgradeRequestForm, 3 assistants d'onboarding) : il n'est pas touché.

**Le site 2 s'arrête au lieu de finaliser, et c'est une décision.** Une écriture de brouillon
refusée dit que le réseau vient de refuser un PUT ; `onComplete` emprunte le même chemin. On
préfère un bouton qui reste actionnable et un message qui dit de réessayer, plutôt qu'une
finalisation tentée sur un lien qui vient de lâcher — suivie d'un `clear()` qui détruirait le
brouillon. Le test l'assert explicitement : `onComplete` n'est pas appelé, aucun DELETE ne part.

**Dette adjacente, NON corrigée (hors périmètre).** Le garde `if (!completing)` du site 1 est du
code mort : l'effet a `[hydrated]` pour seule dépendance, sa fermeture capture donc `completing`
tel qu'il valait à l'hydratation — `false`, toujours. Le correctif ne l'aggrave pas et n'en dépend
pas ; il mérite son propre ticket.

**Les doublures de `flush()` : le même défaut, un cran plus haut.** Le correctif a fait tomber
trois fichiers de tests — non parce qu'il les casse, mais parce qu'il est **le premier appelant à
LIRE** la valeur que TCK-465 avait rendue. Une doublure qui rend `undefined` là où le contrat rend
un objet est verte tant que personne ne regarde : *c'est exactement le défaut de ce ticket, déplacé
du produit vers les tests.* D'où un balayage de TOUTES les doublures du dépôt, et non des seules
qui rougissaient.

`grep -rn 'flush:' src --include='*.test.tsx' --include='*.test.ts'` → 6 sites. ⚠ Le dépôt porte
**deux** contrats `flush()` homonymes, et seul le premier est concerné :
`useWizardDraft.flush(): Promise<ResultatEcritureBrouillon>` et
`useDebouncedValue.flush(): void` (synchrone — les `commit.flush()` de `DebouncedSearchInput`,
`FilterSidebar`, `PropertyModerationWorkspace`, `SuperAdminPropertiesFilters` appellent le vrai
chemin de production et ne sont pas des doublures).

| Site | État | Verdict |
|---|---|---|
| `onboarding/__tests__/OwnerOnboardingWizard.test.tsx:51` | `mockResolvedValue(undefined)` | **rouge → corrigé** |
| `onboarding/__tests__/ServiceProviderOnboardingWizard.test.tsx:51` | idem | **rouge → corrigé** |
| `onboarding/__tests__/AgentOnboardingWizard.test.tsx:55` | idem | **rouge → corrigé** |
| `property-form/__tests__/PropertyWizard.test.tsx:54` | `vi.fn()` nu, **mais** `beforeEach` l. 108 pose `mockResolvedValue({ ok: true, ecrit: true })` | déjà honnête — rien à faire |
| `property-form/__tests__/cibles-tactiles.test.tsx:34` | `flush: vi.fn()` nu, aucun `mockResolvedValue` | **verte et fausse** — `PropertyWizard.reprendrePlusTard` lit `issue.ok` (l. 379) ; ce test ne l'atteint pas, donc rien ne rougit. Hors périmètre → collision |
| `agency/__tests__/UpgradeRequestForm.test.tsx:42` | `mockResolvedValue(undefined)` | **verte et fausse** — hors périmètre → collision |

**Et le balayage a trouvé un TROISIÈME site du défaut lui-même, hors de ce ticket.**
`UpgradeRequestForm.tsx:135` fait `await flush();` et **jette le résultat**, exactement comme les
deux sites corrigés ici. Ce composant n'emploie pas `WizardReprenable` : il appelle `useWizardDraft`
en direct. C'est un ticket à ouvrir, pas un débordement à commettre — sa doublure verte-et-fausse
est d'ailleurs verte *parce que* l'appelant ne lit rien.

Les trois corrections portent le motif **dans le code**, au-dessus de la ligne : une doublure qui
rend `undefined` ne simule pas le silence d'avant, elle rend une valeur qu'aucun appelant ne sait
lire — et `{ ok: true, ecrit: false }` est ce que la production rend au repos.
