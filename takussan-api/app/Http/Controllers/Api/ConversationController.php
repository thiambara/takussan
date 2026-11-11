<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\MessagesConversationRequest;
use App\Http\Requests\Api\SendMessageConversationRequest;
use App\Http\Requests\Api\StoreConversationRequest;
use App\Http\Requests\Api\ToggleMuteConversationRequest;
use App\Http\Requests\Api\UpdateConversationRequest;
use App\Http\Requests\Conversation\CreateGroupConversationRequest;
use App\Http\Requests\Conversation\ListConversationsRequest;
use App\Http\Resources\ConversationContextResource;
use App\Http\Resources\ConversationResource;
use App\Http\Resources\MessageResource;
use App\Jobs\NotifyNewMessageJob;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\User;
use App\Services\Media\AvatarReencode;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\ConversationThreadContext;
use App\Services\Messaging\GroupConversationService;
use App\Support\CaseInsensitive;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Spatie\Image\Exceptions\CouldNotLoadImage;

class ConversationController extends Controller
{
    /** TCK-2630 — au-delà, la saisie est une phrase : on ne garde que les premiers mots. */
    private const SEARCH_TERMS = 6;

    public function index(ListConversationsRequest $request): JsonResponse
    {
        $user = $request->user();
        $includeArchived = (bool) $request->boolean('archived');

        // Reprise du 2026-09-24 — la liste ne rendait NI `participants` NI `unread_count`, que le
        // front lit tous deux (`useUnreadCount`, `ConversationList`) : la pastille des messages non
        // lus restait à 0, l'icône « sourdine » et le compte des membres d'un groupe n'apparaissaient
        // jamais. Est non lu, pour le lecteur, tout message d'un AUTRE postérieur à son
        // `last_read_at` — hors avis système (« X a rejoint le groupe ») : on ne les attend pas.
        // TCK-671 (P06.02) — `lastMessage` : le front dérive l'aperçu d'un avis système de son `metadata.event`.
        // TCK-861 (P38.07) — les membres ACTUELS seuls, comme `show()` : le nom et l'avatar d'un
        // ancien membre partaient dans la liste de chacun.
        $nonLus = function ($q) use ($user) {
            $q->where('messages.type', '!=', MessageType::System->value)
                ->where(fn ($w) => $w->whereNull('messages.sender_id')->orWhere('messages.sender_id', '!=', $user->id))
                ->whereExists(fn ($p) => $p->selectRaw('1')
                    ->from('conversation_participants as lecteur')
                    ->whereColumn('lecteur.conversation_id', 'messages.conversation_id')
                    ->where('lecteur.user_id', $user->id)
                    ->where(fn ($l) => $l->whereNull('lecteur.last_read_at')
                        ->orWhereColumn('lecteur.last_read_at', '<', 'messages.created_at')));
        };

        // TCK-2630 — le cloisonnement est posé UNE fois, sur une base commune : la liste (archives
        // ou non) et les compteurs des puces (`meta.counts`, toujours hors archives) en dérivent.
        // Le rappeler pour chacune rejouerait `answeredPropertyIds()` (une requête par appel).
        $cloisonne = Conversation::query()
            // TCK-592 (verif-592, B2) — un fil d'intervention inaccessible n'apparaît pas.
            ->tap(fn ($q) => app(ConversationAccess::class)->constrainListing($q, $user));
        $ou = fn (bool $archives) => (clone $cloisonne)
            ->whereHas('participants', function ($q) use ($user, $archives) {
                $q->where('user_id', $user->id);
                // TCK-085 — participants who left a group no longer see it.
                $q->whereNull('conversation_participants.left_at');
                if ($archives) {
                    $q->whereNotNull('conversation_participants.archived_at');
                } else {
                    $q->whereNull('conversation_participants.archived_at');
                }
            });
        $liste = $ou($includeArchived);

        $paginator = (clone $liste)
            // TCK-2630 — les filtres ne portent que sur la page : ni `unread_total` ni `meta.counts`.
            ->tap(fn ($q) => $this->filtrerLaListe($q, $request, $user, $nonLus))
            ->with([
                'property.media',
                'participants' => fn ($q) => $q->wherePivotNull('left_at')->with('media'),
                'lastMessage',
            ])
            ->withCount(['messages as unread_count' => $nonLus])
            // TCK-1389 (P135.06) — départage par `id` : deux fils de même horodatage changeaient de
            // page d'une requête à l'autre, ce que le défilement infini de la liste rend visible.
            ->orderByDesc('last_message_at')
            ->orderByDesc('conversations.id')
            ->paginate($this->tailleDePage($request, 20));

        // TCK-1387 (P135.02) — le total des non-lus de TOUTE la liste, et non de la page : la pastille
        // additionnait les `unread_count` des 30 premiers fils, et un non-lu plus ancien ne comptait
        // pas. Hors fils en sourdine, la règle que `useUnreadCount` appliquait à la page.
        $unreadTotal = Message::query()
            ->whereIn('messages.conversation_id', (clone $liste)
                ->whereHas('participants', fn ($q) => $q
                    ->where('conversation_participants.user_id', $user->id)
                    ->where('conversation_participants.is_muted', false))
                ->select('conversations.id'))
            ->tap($nonLus)
            ->count();

        // TCK-2630 — les compteurs des puces, sur tout le cloisonné hors archives et SANS les
        // filtres : `all` et `group` en une requête, `unread` par la définition même du compte de
        // la liste (`$nonLus`). `unread` compte des FILS, sourdine comprise — la puce « Non lus »
        // filtre par `filter[unread]`, qui ne regarde pas la sourdine ; `unread_total` compte des
        // MESSAGES hors sourdine (la pastille).
        $actifs = $ou(false);
        $parType = (clone $actifs)->toBase()
            ->selectRaw('count(*) as tous, count(*) filter (where conversations.type = ?) as groupes', [ConversationType::Group->value])
            ->first();
        $counts = [
            'all' => (int) $parType->tous,
            'unread' => (clone $actifs)->whereHas('messages', $nonLus)->count(),
            'group' => (int) $parType->groupes,
        ];

        return $this->paginated(
            $paginator,
            ConversationResource::collection($paginator)->toArray($request),
            ['unread_total' => $unreadTotal, 'counts' => $counts],
        );
    }

    /**
     * TCK-2630 — `filter[search]`, `filter[unread]`, `filter[type]`, cumulables, typés par
     * {@see ListConversationsRequest}.
     *
     * La recherche : chaque mot (au plus {@see self::SEARCH_TERMS}) doit trouver le prénom ou le nom
     * d'un membre ACTUEL autre que l'appelant, le titre ou la référence du bien, ou le sujet du fil.
     * La casse se replie par `CaseInsensitive` (ADR-0025 : `lower()` nu ne replie que l'ASCII sous
     * `--locale=C`) ; les accents ne se replient pas (ADR-0020 §2, pas d'`unaccent` sans ticket) —
     * la règle de la recherche de biens de `ConversationContextController`. `%` et `_` sont pris au
     * pied de la lettre. Moins de 2 caractères : ignorée. Une condition de plus, jamais une requête
     * par fil.
     *
     * @param  Builder<Conversation>  $query
     */
    private function filtrerLaListe(Builder $query, ListConversationsRequest $request, User $user, Closure $nonLus): void
    {
        $filtres = $request->validated('filter') ?? [];

        if (($filtres['type'] ?? null) !== null) {
            $query->where('conversations.type', $filtres['type']);
        }

        if (in_array($filtres['unread'] ?? null, ['1', 'true'], true)) {
            $query->whereHas('messages', $nonLus);
        }

        $saisie = trim((string) ($filtres['search'] ?? ''));
        if (mb_strlen($saisie) < 2) {
            return;
        }

        $mots = array_slice(preg_split('/\s+/u', $saisie, -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, self::SEARCH_TERMS);
        foreach ($mots as $mot) {
            $motif = '%'.addcslashes(CaseInsensitive::fold($mot), '\\%_').'%';
            $query->where(fn (Builder $q) => $q
                ->whereRaw(CaseInsensitive::sql('conversations.subject').' LIKE ?', [$motif])
                ->orWhereHas('property', fn (Builder $p) => $p
                    ->whereRaw(CaseInsensitive::sql('properties.title').' LIKE ?', [$motif])
                    ->orWhereRaw(CaseInsensitive::sql('properties.reference_number').' LIKE ?', [$motif]))
                ->orWhereHas('participants', fn (Builder $m) => $m
                    ->whereNull('conversation_participants.left_at')
                    ->where('users.id', '!=', $user->id)
                    ->where(fn (Builder $n) => $n
                        ->whereRaw(CaseInsensitive::sql('users.first_name').' LIKE ?', [$motif])
                        ->orWhereRaw(CaseInsensitive::sql('users.last_name').' LIKE ?', [$motif]))));
        }
    }

    /**
     * TCK-2630 — `GET /api/conversations/{conversation}/context` : le bien, le bail, l'intervention
     * et, pour le personnel de l'agence du fil, la fiche CRM de l'autre participant d'une directe.
     *
     * La garde est celle de `show` (`ensureParticipant` → `ConversationAccess::allows`) : 403 pour
     * un non-participant, un ancien membre ou un fil d'intervention devenu inaccessible. Chaque
     * bloc se juge ensuite seul ({@see ConversationThreadContext}) et vaut `null` s'il est interdit.
     */
    public function context(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureParticipant($request, $conversation);

        return $this->json([
            'data' => ConversationContextResource::make(ConversationThreadContext::for($request->user(), $conversation))->resolve($request),
        ]);
    }

    public function store(StoreConversationRequest $request, GroupConversationService $groups): JsonResponse
    {
        // TCK-085 — group requests get the dedicated FormRequest
        // (subject required, 3..20 total participants).
        $type = $request->input('type', ConversationType::Direct->value);
        if ($type === ConversationType::Group->value) {
            return $this->storeGroup($request, $groups);
        }

        $data = $request->validated();

        $user = $request->user();

        $participantIds = array_values(array_unique(array_filter(
            $data['participants'],
            fn ($id) => (int) $id !== (int) $user->id
        )));
        abort_code_if(count($participantIds) === 0, 422, 'conversation.participant_required');
        $data['participants'] = $participantIds;

        $initialMessage = null;

        $conversation = DB::transaction(function () use ($data, $user, &$initialMessage) {
            $conversation = Conversation::create([
                'subject' => $data['subject'] ?? null,
                'type' => $data['type'] ?? ConversationType::Direct->value,
                'status' => ConversationStatus::Active->value,
                'created_by' => $user->id,
                'property_id' => $data['property_id'] ?? null,
                'lease_id' => $data['lease_id'] ?? null,
            ]);

            $participantIds = array_unique(array_merge($data['participants'], [$user->id]));
            foreach ($participantIds as $pid) {
                $conversation->participants()->attach($pid, ['joined_at' => now()]);
            }

            if (! empty($data['initial_message'])) {
                $message = $conversation->messages()->create([
                    'sender_id' => $user->id,
                    'content' => $data['initial_message'],
                    'type' => MessageType::Text->value,
                ]);
                $conversation->update([
                    'last_message_id' => $message->id,
                    'last_message_preview' => mb_substr($message->content, 0, 255),
                    'last_message_at' => now(),
                ]);
                $initialMessage = $message;
            }

            return $conversation;
        });

        // TCK-805 (P38.03) — the initial message is notified like any other, after the commit
        // (same path as sendMessage()).
        if ($initialMessage !== null) {
            NotifyNewMessageJob::dispatch($initialMessage->id);
        }

        $conversation->loadMissing('property');

        return $this->json([
            'data' => ConversationResource::make($conversation)->resolve($request),
        ], 201);
    }

    /**
     * TCK-085 — `POST /conversations` with `type = group`.
     *
     * The body is validated by `CreateGroupConversationRequest` (subject
     * required, 2..19 *other* participants → 3..20 total). The creator is
     * promoted to admin automatically by the service.
     */
    protected function storeGroup(Request $request, GroupConversationService $groups): JsonResponse
    {
        // Re-validate via the dedicated FormRequest. We instantiate it
        // manually because we branched off `Request` after the route hit
        // — Laravel's container resolution already happened.
        $form = CreateGroupConversationRequest::createFrom($request);
        $form->setContainer(app())->setRedirector(app('redirect'));
        $form->validateResolved();
        $data = $form->validated();

        $user = $request->user();

        $conversation = $groups->create(
            $user,
            $data['subject'],
            array_map('intval', $data['participants']),
            $data['property_id'] ?? null,
            $data['lease_id'] ?? null,
        );

        if (! empty($data['initial_message'])) {
            $message = $conversation->messages()->create([
                'sender_id' => $user->id,
                'content' => $data['initial_message'],
                'type' => MessageType::Text->value,
            ]);
            $conversation->refresh();

            // TCK-805 (P38.03) — same notification path as sendMessage().
            NotifyNewMessageJob::dispatch($message->id);
        }

        $conversation->loadMissing('property');

        return $this->json([
            'data' => ConversationResource::make($conversation)->resolve($request),
        ], 201);
    }

    /**
     * TCK-085 — `PATCH /conversations/{conversation}` for admin-only
     * rename. Body: `{ subject }`. Per-participant mute is handled by
     * the dedicated `toggleMute` route.
     */
    public function update(UpdateConversationRequest $request, Conversation $conversation, GroupConversationService $groups): JsonResponse
    {

        $user = $request->user();

        $data = $request->validated();

        $groups->rename($conversation, $user, $data['subject']);

        $fresh = $conversation->fresh()?->loadForDetail();

        return $this->json([
            'data' => ConversationResource::make($fresh)->resolve($request),
        ]);
    }

    /**
     * TCK-085 — Toggle per-participant mute. Stored on
     * `ConversationParticipant.is_muted`. Notifications honour this
     * flag at fan-out time (see {@see NotifyNewMessageJob}).
     */
    public function toggleMute(ToggleMuteConversationRequest $request, Conversation $conversation, GroupConversationService $groups): JsonResponse
    {

        $data = $request->validated();

        $user = $request->user();
        $groups->setMute($conversation, $user, (bool) $data['is_muted']);

        return $this->json([
            'data' => [
                'conversation_id' => $conversation->id,
                'is_muted' => (bool) $data['is_muted'],
            ],
        ]);
    }

    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureParticipant($request, $conversation);

        // TCK-576 (restes de TCK-565) — les membres ACTUELS : la feuille d'infos d'un groupe en
        // dérive la liste, le rôle de l'utilisateur, et donc l'invitation par nom.
        $conversation->loadForDetail();

        return $this->json([
            'data' => [
                ...ConversationResource::make($conversation)->resolve($request),
                // P248.01 (TCK-2374) — le front cache la saisie quand l'API refuserait l'envoi : le
                // demandeur au bail fini lit le fil d'une intervention sans y écrire.
                'abilities' => [
                    'can_send_message' => app(ConversationAccess::class)->allowsWriting($request->user(), $conversation),
                ],
            ],
        ]);
    }

    public function messages(MessagesConversationRequest $request, Conversation $conversation): JsonResponse
    {

        // TCK — cursor pagination. The history is paged via `before_id` (load
        // older messages on scroll-up); `after_id` is used by the live-polling
        // query to fetch only messages newer than the latest one already in
        // the client cache, so polling never re-downloads loaded history.
        $data = $request->validated();

        $perPage = (int) ($data['per_page'] ?? 30);

        if (isset($data['after_id'])) {
            $messages = $conversation->messages()
                ->where('id', '>', (int) $data['after_id'])
                ->oldest()
                ->orderBy('id')
                // Safety cap if the client missed many ticks (e.g. tab hidden
                // for a long time). The client re-polls so anything beyond
                // this cap will be fetched on the next call.
                ->limit(200)
                // TCK-2013 (P175.04) — `MessageResource` rend l'auteur.
                ->with(['media', 'sender'])
                ->get();

            return $this->json([
                'data' => MessageResource::collection($messages)->toArray($request),
                'meta' => ['has_more' => false],
            ]);
        }

        // Départage par `id` (reprise du 2026-09-24) : `latest()` seul trie sur `created_at`, et des
        // messages de la même seconde revenaient dans un ordre quelconque sous PostgreSQL — mesuré :
        // `ConversationMessagesPaginationTest::test_initial_load…` rouge, selon les classes jouées
        // avant lui. Le curseur (`before_id`, `after_id`) est un `id` : le départage suit le curseur.
        $query = $conversation->messages()->latest()->orderByDesc('id');
        if (isset($data['before_id'])) {
            $query->where('id', '<', (int) $data['before_id']);
        }

        // TCK-592 — `MessageResource` rend `attachments` : les médias chargés d'un coup ;
        // TCK-2013 (P175.04) — et `sender`, l'auteur.
        $messages = $query->limit($perPage)->with(['media', 'sender'])->get();

        return $this->json([
            'data' => MessageResource::collection($messages)->toArray($request),
            'meta' => ['has_more' => $messages->count() === $perPage],
        ]);
    }

    public function sendMessage(SendMessageConversationRequest $request, Conversation $conversation): JsonResponse
    {

        $data = $request->validated();

        $sender = $request->user();

        // Group the message insert, conversation pointer update, sender
        // read-marker and participant auto-unarchive in one transaction so
        // a mid-write failure can't leave half of them applied.
        // TCK-592 — ADR-0038 : une note vocale porte son fichier (collection privée `attachments`)
        // et sa durée déclarée ; son texte est un aperçu neutre pour la liste des conversations.
        $isAudio = ($data['type'] ?? null) === MessageType::Audio->value;
        $audio = $isAudio ? $request->file('audio') : null;
        // TCK-2631 (ADR-0038, amendement du 2026-11-10) — une photo ou un PDF, préparés AVANT la
        // transaction : une photo illisible est refusée sans message ni fichier.
        $piece = $this->pieceJointe($request);

        $message = DB::transaction(function () use ($conversation, $sender, $data, $isAudio, $audio, $piece) {
            $message = $conversation->messages()->create([
                'sender_id' => $sender->id,
                // TCK-2631 — la légende d'une pièce est facultative ; `content` n'est pas nullable, et
                // une pièce sans légende porte une chaîne vide (son aperçu est `neutralPreview()`).
                'content' => $isAudio ? __('messaging.audio_preview') : ($data['content'] ?? ''),
                'type' => $data['type'] ?? MessageType::Text->value,
                'metadata' => $isAudio ? ['duration' => (int) $data['duration']] : null,
            ]);

            if ($audio !== null) {
                $message->addMedia($audio)->toMediaCollection('attachments');
            }

            if ($piece !== null) {
                $message->addMedia($piece['path'])
                    ->usingName($piece['name'])
                    ->usingFileName($piece['file_name'])
                    ->toMediaCollection('attachments');
            }

            $conversation->update([
                'last_message_id' => $message->id,
                // TCK-2631 — l'aperçu d'une pièce est neutre (« Photo », « Document »), légende ou non.
                'last_message_preview' => mb_substr($message->neutralPreview() ?? $message->content, 0, 255),
                'last_message_at' => now(),
            ]);

            // Auto-mark the sender's own read pointer so the new message
            // doesn't show up as unread on the sender's side.
            $conversation->participants()->updateExistingPivot($sender->id, [
                'last_read_at' => now(),
                'archived_at' => null,
            ]);

            // Un-archive the conversation for other participants so a new
            // incoming message makes the thread reappear in their list.
            DB::table('conversation_participants')
                ->where('conversation_id', $conversation->id)
                ->where('user_id', '!=', $sender->id)
                ->update(['archived_at' => null]);

            return $message;
        });

        // Fire-and-forget notification so we don't block the response on
        // mail / broadcasting I/O. Dispatched after the transaction commits
        // so the worker is guaranteed to see the persisted message.
        NotifyNewMessageJob::dispatch($message->id);

        return $this->json([
            'data' => MessageResource::make($message)->resolve($request),
        ], 201);
    }

    /**
     * TCK-2631 (ADR-0038, amendement du 2026-11-10) — la pièce jointe à ranger, ou `null`.
     *
     * Une photo est RÉENCODÉE (`AvatarReencode`, le même geste que l'avatar) : GD n'écrit aucune
     * métadonnée, la position GPS d'une photo prise chez le locataire ne survit pas, et l'orientation
     * EXIF est appliquée aux pixels avant de disparaître. Ses pixels sont déjà bornés par la requête
     * (`PixelsAuPlus`). Un en-tête lisible sur une image que GD ne décode pas rend 422
     * `media.file_rejected`. Un PDF n'est pas réécrit (ses métadonnées restent, comme dans un
     * courriel) ; aucun antivirus ne l'analyse (dette D-73).
     *
     * @return array{path: string|UploadedFile, name: string, file_name: string}|null
     */
    private function pieceJointe(SendMessageConversationRequest $request): ?array
    {
        $type = $request->validated('type');
        $file = $request->file('file');
        if (! $file instanceof UploadedFile || ! in_array($type, [MessageType::Image->value, MessageType::Document->value], true)) {
            return null;
        }

        $name = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        if ($type === MessageType::Document->value) {
            return ['path' => $file, 'name' => $name, 'file_name' => $name.'.pdf'];
        }

        try {
            $path = AvatarReencode::sansMetadonnees($file);
        } catch (CouldNotLoadImage) {
            abort_code(422, 'media.file_rejected');
        }

        return ['path' => $path, 'name' => $name, 'file_name' => AvatarReencode::nomDeFichier($file)];
    }

    public function markAsRead(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureParticipant($request, $conversation);

        $user = $request->user();
        $conversation->participants()->updateExistingPivot($user->id, [
            'last_read_at' => now(),
        ]);

        return $this->json([
            'data' => [
                'conversation_id' => $conversation->id,
                'last_read_at' => $this->instant(now()),
            ],
        ]);
    }

    public function archive(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureParticipant($request, $conversation);

        $user = $request->user();
        $conversation->participants()->updateExistingPivot($user->id, [
            'archived_at' => now(),
        ]);

        return $this->json([
            'data' => [
                'conversation_id' => $conversation->id,
                'archived_at' => $this->instant(now()),
            ],
        ]);
    }

    public function unarchive(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureParticipant($request, $conversation);

        $user = $request->user();
        $conversation->participants()->updateExistingPivot($user->id, [
            'archived_at' => null,
        ]);

        return $this->json([
            'data' => [
                'conversation_id' => $conversation->id,
                'archived_at' => null,
            ],
        ]);
    }

    protected function ensureParticipant(Request $request, Conversation $conversation): void
    {
        // TCK-085 (groupe quitté) et TCK-592 (fil d'intervention jugé par la demande) : une seule
        // garde, `ConversationAccess`.
        abort_unless(app(ConversationAccess::class)->allows($request->user(), $conversation), 403);
    }
}
