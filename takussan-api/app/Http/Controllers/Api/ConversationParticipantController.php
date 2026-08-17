<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\UpdateConversationParticipantRequest;
use App\Http\Requests\Conversation\AddParticipantsRequest;
use App\Http\Resources\ConversationResource;
use App\Models\Conversation;
use App\Models\Enums\ParticipantRole;
use App\Models\User;
use App\Policies\ConversationPolicy;
use App\Services\Messaging\GroupConversationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-085 — Manage the participant set of a group conversation.
 *
 *  - `POST   /conversations/{conversation}/participants` → add (admin only)
 *  - `DELETE /conversations/{conversation}/participants/{user}` → remove or self-leave
 *  - `PATCH  /conversations/{conversation}/participants/{user}` → promote/demote (admin only)
 *
 * Authorisation is delegated to {@see ConversationPolicy}.
 * Business invariants (last-admin guard, system messages, notifications)
 * live in {@see GroupConversationService}.
 */
class ConversationParticipantController extends Controller
{
    public function __construct(
        protected GroupConversationService $groups,
    ) {}

    public function store(AddParticipantsRequest $request, Conversation $conversation): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->can('addParticipant', $conversation), 403, __('messaging.errors.admin_only'));

        $userIds = array_map('intval', (array) $request->validated('user_ids'));
        $added = $this->groups->addParticipants($conversation, $user, $userIds);

        return $this->json([
            'data' => [
                'conversation_id' => $conversation->id,
                'added_user_ids' => $added,
            ],
        ], 201);
    }

    public function destroy(Request $request, Conversation $conversation, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_unless(
            $actor->can('removeParticipant', [$conversation, $user]),
            403,
            __('messaging.errors.admin_only'),
        );

        $this->groups->removeParticipant($conversation, $actor, $user);

        return $this->json([
            'data' => [
                'conversation_id' => $conversation->id,
                'removed_user_id' => $user->id,
            ],
        ]);
    }

    public function update(UpdateConversationParticipantRequest $request, Conversation $conversation, User $user): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor->can('promote', $conversation), 403, __('messaging.errors.admin_only'));

        $data = $request->validated();

        $role = $data['role'] instanceof ParticipantRole
            ? $data['role']
            : ParticipantRole::from($data['role']);

        $this->groups->setRole($conversation, $actor, $user, $role);

        return $this->json([
            'data' => ConversationResource::make($conversation->fresh())->toArray($request),
        ]);
    }
}
