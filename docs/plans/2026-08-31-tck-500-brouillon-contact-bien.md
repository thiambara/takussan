# TCK-500 — Plan d'implémentation

> Le ticket est le contrat (`docs/backlog/tickets/TCK-500-brouillon-de-contact-et-chat-en-contexte.md`).
> Ce plan est **temporaire** : il nomme les fichiers, ce que le ticket s'interdit de faire côté front.

## Ordre

Le backend d'abord : le front a besoin de l'endpoint de résolution pour savoir s'il ouvre un fil
existant ou un fil neuf, et c'est cette réponse qui décide de tout le reste de l'écran.

---

## A · Backend (`takussan-api/`)

### A1 — `App\Services\Conversation\PropertyConversationResolver`

Extrait **tel quel** de `PublicPropertyController::contactMessage()` (lignes 757-789) :

```php
recipientFor(Property $property): ?User          // collaborateur Agent, à défaut owner
findExisting(Property, User $user, User $recipient): ?Conversation   // sans lock
firstOrCreate(Property, User $user, User $recipient): Conversation   // avec lock, transaction
```

`findExisting` et `firstOrCreate` partagent **la même clause** (une méthode privée qui rend le
`Builder`), sans quoi AC6 ne tient pas.

### A2 — `contactMessage()` consomme le service

Aucun changement observable. `redirect_to` passe à `/app/messages?conversation={id}`.

### A3 — `PublicPropertyController::conversation()`

Route `GET public/properties/{slug}/conversation`, nom `properties.conversation`, derrière
`auth:sanctum`. Même `firstOrFail()` public/non-draft que `contactMessage`.

```json
{"data":{"conversation_id":42|null,"can_message":true,
         "property":{"id":1,"slug":"…","title":"…","reference_number":"TK-…"},
         "recipient":{"id":7,"name":"…","avatar_url":"…"}|null}}
```

### A4 — Tests

- `tests/Feature/Public/PropertyConversationResolveTest.php` — 7 cas (cf. AC).
- `PropertyContactMessageTest` — un cas d'égalité résolution ↔ livraison (AC6).

---

## B · Frontend (`takussan-web/`)

### B1 — Le texte

`src/messages/{fr,en,wo}.json` → `messaging.propertyDraft` (`{title}`, `{reference}`).
`src/lib/messages/brouillonBien.ts` → `construireBrouillonBien(t, {title, reference_number})`.
Pure, aucun hook. Test unitaire `__tests__/brouillonBien.test.ts`.

### B2 — L'accès à l'endpoint

`src/app/actions/property.ts` → `resolvePropertyConversation(slug)`.
Type `PropertyConversationResolution` dans `src/types/message.ts`.

### B3 — Le canal fiche ↔ widget

`src/context/ChatDraftContext.tsx` — provider monté dans `src/app/layout.tsx` autour de
`{children}` **et** de `<ChatWidget />` (ce sont deux frères).

```ts
ouvrirChatBien({ slug, title, reference_number }): void
```

`< 768 px` → `router.push('/app/messages?property=<slug>')`. **Jamais de texte dans l'URL.**
`≥ 768 px` → pose la cible, le widget la consomme.

### B4 — `ChatComposer`

`src/components/messages/ChatComposer.tsx`, extrait de `ChatView` (formulaire lignes 403-451).
Props : `{ defaultValue, pieceJointeAutorisee, onSend, pending }`.
⚠ `defaultValue` posé **une seule fois** (clé de remontage), jamais réimposé — AC3.

### B5 — `ChatView` : `conversationId: number | null`

`nouveau?: { slug, title, reference_number, recipient }`. Quand `conversationId === null` :
hooks appelés mais `enabled: false`, en-tête depuis `nouveau`, fil vide, trombone masqué,
envoi par `submitContactMessage` puis `onConversationCreated(id)`.

### B6 — `ChatWidget`

Consomme le contexte : ouvre le panneau et monte `ChatView` en mode neuf ou sur le fil trouvé.
⚠ Il est masqué sur `/app/messages` — sans effet ici, la fiche du bien est ailleurs.

### B7 — `MessagesPage`

Lit `?property=<slug>`, résout, puis même bascule. Le brouillon est reconstruit **ici**, dans la
locale de la page.

### B8 — Fiche du bien

`PropertyDetailContent` : connecté → `ouvrirChatBien(...)` ; anonyme → le modal actuel.
`can_message === false` → le bouton n'est pas rendu (AC8).
`AnonymousLeadDialog` reçoit `defaultMessage`.

### B9 — Tests

`brouillonBien`, `ChatComposer`, `ChatView` mode neuf, `PropertyDetailContent` (desktop/mobile),
`MessagesPage` (`?property=`).

---

## Vérification

Chaque test rougit sans son correctif (ablation, AC13). Pint avant commit. `npx tsc --noEmit` +
`npm run lint`. Tests ciblés seulement — la suite entière est jouée une fois, à la fin.
