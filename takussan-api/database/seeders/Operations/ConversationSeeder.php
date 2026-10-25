<?php

namespace Database\Seeders\Operations;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Services\Messaging\PropertyConversationResolver;
use App\Services\Property\PrimaryPropertyContact;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
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

    /**
     * TCK-1875 (P191.05) — les fils semés ont la forme de ceux que l'application écrit, et de
     * ceux-là seulement :
     *
     *  - une **directe de prospect** : `direct` + `property_id`, deux participants, créée par le
     *    prospect (un client de l'agence qui a un compte) et adressée au contact principal du
     *    bien, comme {@see PropertyConversationResolver::firstOrCreate()} ; un seul fil par
     *    prospect et par bien, comme la recherche de ce même résolveur ;
     *  - un **groupe** : `group`, un sujet, trois participants ou plus, créateur administrateur.
     *
     * Avant, un bien tiré donnait un fil `property` de deux à quatre participants : une forme
     * qu'aucun écrivain de l'application ne produit et que `ConversationAccess::isProspectThread()`
     * ne juge pas. Les fils déjà en base ne sont pas réécrits.
     */
    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $users = $this->ctx->usersByAgency[$agency->id] ?? collect();
            $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agency->id);
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();

            if ($users->count() < 2 || $agents->isEmpty()) {
                continue;
            }

            $userIds = $users->pluck('id')->values();
            $agentIds = $agents->pluck('id')->values();
            $prospectIds = ($this->ctx->customersByAgency[$agency->id] ?? collect())
                ->pluck('user_id')->filter()->map(fn ($id) => (int) $id)->unique()->values();
            $contacts = $this->contactsFor($properties);
            /** @var array<string, true> $prospectThreads */
            $prospectThreads = [];

            $conversationsCount = $this->ctx->config->conversationsPerAgency;
            for ($i = 0; $i < $conversationsCount; $i++) {
                $createdAt = Timeline::randomDateBetween(
                    Timeline::seedStart(),
                    Timeline::seedEnd(),
                );

                $propertyId = $contacts !== [] && $prospectIds->isNotEmpty() && $this->ctx->faker()->boolean(60)
                    ? (int) array_rand($contacts)
                    : null;
                $prospectId = $propertyId !== null
                    ? $prospectIds->reject(fn (int $id) => $id === $contacts[$propertyId])->pipe(Tirage::un(...))
                    : null;

                if ($propertyId !== null && $prospectId !== null && ! isset($prospectThreads["{$propertyId}:{$prospectId}"])) {
                    $prospectThreads["{$propertyId}:{$prospectId}"] = true;
                    $this->conversations->push($this->seed(
                        ConversationType::Direct, null, $prospectId, $propertyId,
                        [$prospectId, $contacts[$propertyId]], null, $createdAt,
                    ));

                    continue;
                }

                $creator = (int) Tirage::un($agentIds);
                $others = $userIds->map(fn ($id) => (int) $id)->reject(fn (int $id) => $id === $creator)->values();
                if ($others->count() < 2) {
                    continue;
                }

                $this->conversations->push($this->seed(
                    ConversationType::Group,
                    $this->ctx->texts()->sujetDeGroupe(),
                    $creator,
                    null,
                    Tirage::plusieurs($others, min($this->ctx->faker()->numberBetween(2, 3), $others->count()))->prepend($creator)->all(),
                    $creator,
                    $createdAt,
                ));
            }
        }
    }

    /**
     * Le contact principal de chaque bien qui en a un, par la règle de l'application.
     *
     * @param  Collection<int, Property>  $properties
     * @return array<int, int> property_id => user_id
     */
    private function contactsFor(Collection $properties): array
    {
        if ($properties->isEmpty()) {
            return [];
        }

        return Property::query()
            ->with(PrimaryPropertyContact::eagerLoads())
            ->whereIn('id', $properties->pluck('id'))
            ->get()
            ->mapWithKeys(fn (Property $p) => [$p->id => PrimaryPropertyContact::for($p)?->id])
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /** @param  array<int, int>  $participantIds */
    private function seed(
        ConversationType $type,
        ?string $subject,
        int $creator,
        ?int $propertyId,
        array $participantIds,
        ?int $adminId,
        \DateTimeInterface $createdAt,
    ): Conversation {
        $conversation = Conversation::withoutEvents(fn () => Conversation::create([
            'subject' => $subject,
            'property_id' => $propertyId,
            'type' => $type->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $creator,
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]));

        foreach (array_unique($participantIds) as $userId) {
            ConversationParticipant::updateOrCreate(
                [
                    'conversation_id' => $conversation->id,
                    'user_id' => $userId,
                ],
                [
                    'role' => $userId === $adminId ? 'admin' : 'member',
                    'joined_at' => $createdAt,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ],
            );
        }

        return $conversation;
    }
}
