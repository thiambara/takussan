<?php

namespace Database\Seeders\Operations;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Enums\UserType;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

class ConversationSeeder extends Seeder
{
    /** @var Collection<int, Conversation> */
    public Collection $conversations;

    public function __construct(private readonly SeedingContext $ctx)
    {
        $this->conversations = collect();
    }

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $users = $this->ctx->usersByAgency[$agency->id] ?? collect();
            $agents = $this->ctx->usersOfType($agency->id, UserType::Agent->value);
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();

            if ($users->count() < 2 || $agents->isEmpty()) {
                continue;
            }

            $userIds = $users->pluck('id')->values();
            $agentIds = $agents->pluck('id')->values();

            // ~20 conversations per agency.
            for ($i = 0; $i < 20; $i++) {
                $createdAt = Timeline::randomDateBetween(
                    Timeline::seedStart(),
                    Timeline::seedEnd(),
                );
                $creator = $agentIds->random();
                $propertyId = $properties->isNotEmpty() && $this->ctx->faker()->boolean(60)
                    ? $properties->pluck('id')->random()
                    : null;

                $type = $propertyId
                    ? ConversationType::Property->value
                    : ConversationType::Direct->value;

                $conversation = Conversation::withoutEvents(function () use (
                    $type, $creator, $propertyId, $createdAt
                ) {
                    return Conversation::create([
                        'subject' => $this->ctx->faker()->sentence(4),
                        'property_id' => $propertyId,
                        'type' => $type,
                        'status' => ConversationStatus::Active->value,
                        'created_by' => $creator,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);
                });

                // Attach 2–4 participants including creator.
                $participantIds = collect([$creator])
                    ->merge($userIds->random(min(3, $userIds->count() - 1)))
                    ->unique()
                    ->values();

                foreach ($participantIds as $userId) {
                    ConversationParticipant::updateOrCreate(
                        [
                            'conversation_id' => $conversation->id,
                            'user_id' => $userId,
                        ],
                        [
                            'role' => $userId === $creator ? 'owner' : 'member',
                            'joined_at' => $createdAt,
                            'created_at' => $createdAt,
                            'updated_at' => $createdAt,
                        ],
                    );
                }

                $this->conversations->push($conversation);
            }
        }
    }
}
