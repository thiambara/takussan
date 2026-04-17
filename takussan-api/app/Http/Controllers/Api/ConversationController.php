<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\ConversationResource;
use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ConversationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $paginator = Conversation::whereHas('participants', fn ($q) => $q->where('user_id', $user->id))
            ->orderByDesc('last_message_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => ConversationResource::collection($paginator)->toArray($request),
            'meta' => ['total' => $paginator->total(), 'current_page' => $paginator->currentPage()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['nullable', 'string'],
            'type' => ['nullable', Rule::enum(ConversationType::class)],
            'participants' => ['required', 'array', 'min:1'],
            'participants.*' => ['exists:users,id'],
            'property_id' => ['nullable', 'exists:properties,id'],
            'lease_id' => ['nullable', 'exists:leases,id'],
            'initial_message' => ['nullable', 'string'],
        ]);

        $user = $request->user();

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

        return $this->json([
            'data' => ConversationResource::make($conversation)->toArray($request),
        ], 201);
    }

    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureParticipant($request, $conversation);

        return $this->json([
            'data' => ConversationResource::make($conversation)->toArray($request),
        ]);
    }

    public function messages(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureParticipant($request, $conversation);

        $messages = $conversation->messages()
            ->latest()
            ->paginate((int) $request->input('per_page', 30));

        return $this->json([
            'data' => MessageResource::collection($messages)->toArray($request),
            'meta' => ['total' => $messages->total(), 'current_page' => $messages->currentPage()],
        ]);
    }

    public function sendMessage(Request $request, Conversation $conversation): JsonResponse
    {
        $this->ensureParticipant($request, $conversation);

        $data = $request->validate([
            'content' => ['required', 'string'],
            'type' => ['nullable', Rule::enum(MessageType::class)],
        ]);

        $message = $conversation->messages()->create([
            'sender_id' => $request->user()->id,
            'content' => $data['content'],
            'type' => $data['type'] ?? MessageType::Text->value,
        ]);

        $conversation->update([
            'last_message_id' => $message->id,
            'last_message_preview' => mb_substr($message->content, 0, 255),
            'last_message_at' => now(),
        ]);

        return $this->json([
            'data' => MessageResource::make($message)->toArray($request),
        ], 201);
    }

    protected function ensureParticipant(Request $request, Conversation $conversation): void
    {
        $isParticipant = $conversation->participants()->where('user_id', $request->user()->id)->exists();
        abort_unless($isParticipant, 403);
    }
}
