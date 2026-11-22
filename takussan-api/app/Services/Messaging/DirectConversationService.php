<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\User;
use App\Support\AdvisoryLock;
use Illuminate\Database\Eloquent\Builder;

/**
 * Contre-vérification de TCK-2632 — LA directe entre deux personnes, dans un contexte.
 *
 * `POST /api/conversations` (une directe) créait une conversation NEUVE à chaque appel : « Écrire »
 * depuis une fiche, deux fois, ouvrait deux fils entre les deux mêmes personnes, et la messagerie
 * les listait côte à côte. La directe existante entre l'acteur et l'autre personne, dans le même
 * contexte (`lease_id`, ou aucun ; une directe de `store` n'a jamais de bien, TCK-888), est rendue
 * à la place.
 *
 * « Existante », c'est : directe, active, sans bien, du même bail (ou sans bail), où les deux
 * personnes sont participantes ACTIVES et où personne d'autre ne l'est. Une directe quittée par
 * l'un des deux (membre retiré de l'agence, `AgencyMemberRemovalService`) n'est pas reprise.
 *
 * La recherche et la création se font sous un verrou consultatif propre à la paire et au contexte
 * (ADR-0073) : deux appels simultanés ne créent pas deux fils — le second attend le COMMIT du
 * premier, puis le trouve. `CreateDirectConversationRaceTest` le prouve avec une seconde connexion.
 * Le fil de prospect d'un bien a son propre écrivain ({@see PropertyConversationResolver}).
 */
class DirectConversationService
{
    /**
     * La directe entre `$actor` et `$otherId` dans ce contexte, créée si elle n'existe pas.
     * À appeler dans une transaction ouverte : le verrou tient jusqu'à son COMMIT.
     *
     * @return array{0: Conversation, 1: bool} la directe, et `true` si elle vient d'être créée
     */
    public function firstOrCreate(User $actor, int $otherId, ?int $leaseId, ?string $subject = null): array
    {
        $paire = [(int) $actor->id, $otherId];
        sort($paire);
        AdvisoryLock::acquire('conversation_directe', (string) $paire[0], (string) $paire[1], (string) ($leaseId ?? 0));

        $existante = $this->existante((int) $actor->id, $otherId, $leaseId)->first();
        if ($existante !== null) {
            return [$existante, false];
        }

        $conversation = Conversation::create([
            'subject' => $subject,
            'type' => ConversationType::Direct->value,
            'status' => ConversationStatus::Active->value,
            'created_by' => $actor->id,
            'property_id' => null,
            'lease_id' => $leaseId,
        ]);
        $conversation->participants()->attach([
            $actor->id => ['joined_at' => now()],
            $otherId => ['joined_at' => now()],
        ]);

        return [$conversation, true];
    }

    /** @return Builder<Conversation> */
    private function existante(int $actorId, int $otherId, ?int $leaseId): Builder
    {
        $actif = fn (int $userId) => fn (Builder $q) => $q
            ->where('conversation_participants.user_id', $userId)
            ->whereNull('conversation_participants.left_at');

        return Conversation::query()
            ->where('type', ConversationType::Direct->value)
            ->where('status', ConversationStatus::Active->value)
            ->whereNull('property_id')
            ->when(
                $leaseId !== null,
                fn (Builder $q) => $q->where('lease_id', $leaseId),
                fn (Builder $q) => $q->whereNull('lease_id'),
            )
            ->whereHas('participants', $actif($actorId))
            ->whereHas('participants', $actif($otherId))
            ->whereDoesntHave('participants', fn (Builder $q) => $q
                ->whereNotIn('conversation_participants.user_id', [$actorId, $otherId])
                ->whereNull('conversation_participants.left_at'))
            ->orderBy('id');
    }
}
