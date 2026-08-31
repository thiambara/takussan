<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-500 — le fil de discussion attaché à un bien : à qui il s'adresse, et s'il existe déjà.
 *
 * Ce service existe pour une raison précise et une seule : **deux chemins posent désormais la
 * même question, et ils doivent y répondre pareil.**
 *
 *   · `PublicPropertyController::contactMessage()` — ÉCRIT : crée le fil s'il manque, poste.
 *   · `PublicPropertyController::conversation()`   — LIT : dit au front s'il ouvre un fil
 *     existant ou un fil qui n'existe pas encore, pour décider d'afficher ou non le brouillon.
 *
 * Le second sert à ouvrir l'écran, le premier à y envoyer le message. Si les deux calculaient le
 * destinataire de leur côté, un front pourrait ouvrir le fil de Fatou et déposer le message chez
 * Moussa — sans qu'aucun des deux endpoints soit faux pris isolément. C'est le genre d'écart qui
 * ne se voit pas en revue et qui ne se reproduit pas en test unitaire de chaque moitié : il faut
 * que ce soit LE MÊME code. `PropertyConversationResolveTest::test_resolved_recipient_is_the_one_
 * that_receives_the_message` est la garde.
 *
 * ⚠️ `findExisting()` n'écrit RIEN et ne verrouille rien. C'est le contrat du ticket : ouvrir le
 * chat depuis une fiche de bien ne doit laisser aucune trace tant que rien n'est envoyé, sinon
 * chaque visiteur curieux dépose un fil vide dans la boîte d'un agent.
 */
class PropertyConversationResolver
{
    /**
     * Le destinataire d'un message portant sur ce bien : le collaborateur `Agent`, à défaut le
     * propriétaire. Rend `null` quand le bien n'a ni l'un ni l'autre.
     *
     * ⚠️ Suppose `collaborators.user` et `owner` chargés — cf. {@see self::eagerLoads()}.
     */
    public function recipientFor(Property $property): ?User
    {
        return $property->collaborators
            ->firstWhere('role', CollaboratorRole::Agent)?->user
            ?? $property->owner;
    }

    /** Les relations que les deux appelants doivent charger pour que `recipientFor` soit juste. */
    public static function eagerLoads(): array
    {
        return ['owner', 'collaborators.user'];
    }

    /**
     * Le fil existant entre ces deux personnes à propos de ce bien, ou `null`.
     *
     * Lecture pure : ni verrou, ni transaction, ni écriture.
     */
    public function findExisting(Property $property, User $user, User $recipient): ?Conversation
    {
        return $this->query($property, $user, $recipient)->first();
    }

    /**
     * Le fil existant, ou un fil neuf avec ses deux participants.
     *
     * ⚠️ Le verrou porte sur les lignes DÉJÀ là : il ne ferme pas la course de deux `INSERT`
     * simultanés. Ce comportement est celui d'avant TCK-500 et il est repris tel quel —
     * l'élargir serait un autre ticket, et le changer en douce serait pire.
     */
    public function firstOrCreate(Property $property, User $user, User $recipient): Conversation
    {
        return DB::transaction(function () use ($property, $user, $recipient) {
            $existing = $this->query($property, $user, $recipient)->lockForUpdate()->first();

            if ($existing) {
                return $existing;
            }

            $conversation = Conversation::create([
                'type' => ConversationType::Direct->value,
                'status' => ConversationStatus::Active->value,
                'created_by' => $user->id,
                'property_id' => $property->id,
            ]);
            $conversation->participants()->attach([
                $user->id => ['joined_at' => now()],
                $recipient->id => ['joined_at' => now()],
            ]);

            return $conversation;
        });
    }

    /**
     * La clause partagée. Elle vit ici, en un seul endroit, parce que `findExisting` et
     * `firstOrCreate` qui divergeraient produiraient exactement le défaut décrit en tête de
     * classe : on ouvre un fil, on écrit dans un autre.
     */
    private function query(Property $property, User $user, User $recipient): Builder
    {
        return Conversation::query()
            ->where('property_id', $property->id)
            ->whereHas('participants', fn ($q) => $q->where('user_id', $user->id))
            ->whereHas('participants', fn ($q) => $q->where('user_id', $recipient->id));
    }
}
