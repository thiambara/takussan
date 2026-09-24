<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\MessagesConversationRequest;
use App\Http\Requests\Api\SendMessageConversationRequest;
use App\Http\Requests\Api\StoreConversationRequest;
use App\Http\Requests\Api\ToggleMuteConversationRequest;
use App\Http\Requests\Api\UpdateConversationRequest;
use App\Http\Requests\Conversation\CreateGroupConversationRequest;
use App\Http\Resources\ConversationResource;
use App\Http\Resources\MessageResource;
use App\Jobs\NotifyNewMessageJob;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Services\Messaging\GroupConversationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConversationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $includeArchived = (bool) $request->boolean('archived');

        // Reprise du 2026-09-24 — la liste ne rendait NI `participants` NI `unread_count`, que le
        // front lit tous deux (`useUnreadCount`, `ConversationList`) : la pastille des messages non
        // lus restait à 0, l'icône « sourdine » et le compte des membres d'un groupe n'apparaissaient
        // jamais. Est non lu, pour le lecteur, tout message d'un AUTRE postérieur à son
        // `last_read_at` — hors avis système (« X a rejoint le groupe ») : on ne les attend pas.
        $paginator = Conversation::with(['property', 'participants.media'])
            ->withCount(['messages as unread_count' => function ($q) use ($user) {
                $q->where('messages.type', '!=', MessageType::System->value)
                    ->where(fn ($w) => $w->whereNull('messages.sender_id')->orWhere('messages.sender_id', '!=', $user->id))
                    ->whereExists(fn ($p) => $p->selectRaw('1')
                        ->from('conversation_participants as lecteur')
                        ->whereColumn('lecteur.conversation_id', 'messages.conversation_id')
                        ->where('lecteur.user_id', $user->id)
                        ->where(fn ($l) => $l->whereNull('lecteur.last_read_at')
                            ->orWhereColumn('lecteur.last_read_at', '<', 'messages.created_at')));
            }])
            ->whereHas('participants', function ($q) use ($user, $includeArchived) {
                $q->where('user_id', $user->id);
                // TCK-085 — participants who left a group no longer see it.
                $q->whereNull('conversation_participants.left_at');
                if ($includeArchived) {
                    $q->whereNotNull('conversation_participants.archived_at');
                } else {
                    $q->whereNull('conversation_participants.archived_at');
                }
            })
            ->orderByDesc('last_message_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->paginated($paginator, ConversationResource::collection($paginator)->toArray($request));
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
        abort_if(count($participantIds) === 0, 422, 'At least one other participant is required.');
        $data['participants'] = $participantIds;

        $conversation = DB::transaction(function () use ($data, $user) {
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
            }

            return $conversation;
        });

        $conversation->loadMissing('property');

        return $this->json([
            'data' => ConversationResource::make($conversation)->toArray($request),
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
            $data['maintenance_request_id'] ?? null,
        );

        if (! empty($data['initial_message'])) {
            $conversation->messages()->create([
                'sender_id' => $user->id,
                'content' => $data['initial_message'],
                'type' => MessageType::Text->value,
            ]);
            $conversation->refresh();
        }

        $conversation->loadMissing('property');

        return $this->json([
            'data' => ConversationResource::make($conversation)->toArray($request),
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

        $fresh = $conversation->fresh();
        $fresh?->loadMissing('property');

        return $this->json([
            'data' => ConversationResource::make($fresh)->toArray($request),
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
        // dérive la liste, le rôle de l'utilisateur, et donc l'invitation par nom. Sans eux, elle
        // affichait « 0 participant » et cachait toute action d'administration.
        $conversation->loadMissing([
            'property',
            'participants' => fn ($q) => $q->wherePivotNull('left_at')->with('media'),
        ]);

        return $this->json([
            'data' => ConversationResource::make($conversation)->toArray($request),
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

        $messages = $query->limit($perPage)->get();

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
        $message = DB::transaction(function () use ($conversation, $sender, $data) {
            $message = $conversation->messages()->create([
                'sender_id' => $sender->id,
                'content' => $data['content'],
                'type' => $data['type'] ?? MessageType::Text->value,
            ]);

            $conversation->update([
                'last_message_id' => $message->id,
                'last_message_preview' => mb_substr($message->content, 0, 255),
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
            'data' => MessageResource::make($message)->toArray($request),
        ], 201);
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
                'last_read_at' => now()->toISOString(),
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
                'archived_at' => now()->toISOString(),
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
        $user = $request->user();
        if ($user->isSuperAdmin()) {
            return;
        }
        // TCK-085 — `left_at != null` means the user already exited the
        // group; they no longer have read/write access.
        $isParticipant = $conversation->participants()
            ->where('user_id', $user->id)
            ->wherePivotNull('left_at')
            ->exists();
        abort_unless($isParticipant, 403);
    }
}
