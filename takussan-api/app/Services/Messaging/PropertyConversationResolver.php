<?php

namespace App\Services\Messaging;

use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\PrimaryPropertyContact;
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
     * Le destinataire d'un message portant sur ce bien.
     *
     * ⚠️ **Cette méthode ne CONNAÎT plus la règle, elle la DEMANDE** (TCK-502). Elle la portait,
     * et la carte de contact de la fiche publique en portait une autre — `property.owner` — si
     * bien que l'écran nommait quelqu'un et l'envoi quelqu'un d'autre. Une règle partagée par
     * trois chemins de contact mais pas par l'écran qui les déclenche n'est pas partagée.
     * {@see PrimaryPropertyContact} en est désormais la seule définition ; ce délégué reste pour
     * que le vocabulaire de la messagerie — « le destinataire » — garde son mot.
     *
     * ⚠️ Suppose `collaborators.user` et `owner` chargés — cf. {@see self::eagerLoads()}.
     */
    public function recipientFor(Property $property): ?User
    {
        return PrimaryPropertyContact::for($property);
    }

    /** Les relations que les deux appelants doivent charger pour que `recipientFor` soit juste. */
    public static function eagerLoads(): array
    {
        return PrimaryPropertyContact::eagerLoads();
    }

    /**
     * Le fil de ce prospect sur ce bien, quel que soit son répondant, ou `null`.
     *
     * Lecture pure : ni verrou, ni transaction, ni écriture. TCK-887 (ADR-0068 § 3) — le fil
     * n'est plus cherché « entre ces deux personnes » : quand le contact principal change, le
     * prospect retrouve le même fil, que {@see self::firstOrCreate()} transmet avant d'écrire.
     */
    public function findExisting(Property $property, User $user): ?Conversation
    {
        return $this->query($property, $user)->first();
    }

    /**
     * Le fil existant, transmis à `$recipient` s'il ne l'a pas, ou un fil neuf avec ses deux
     * participants.
     *
     * ⚠️ Le verrou porte sur les lignes DÉJÀ là : il ne ferme pas la course de deux `INSERT`
     * simultanés. Ce comportement est celui d'avant TCK-500 et il est repris tel quel —
     * l'élargir serait un autre ticket, et le changer en douce serait pire.
     */
    public function firstOrCreate(Property $property, User $user, User $recipient): Conversation
    {
        return DB::transaction(function () use ($property, $user, $recipient) {
            $existing = $this->query($property, $user)->lockForUpdate()->first();

            if ($existing) {
                $this->transmitLocked($existing, $recipient);

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
     * TCK-887 (ADR-0068 § 3) — LA transmission d'un fil de prospect à son nouveau répondant, sous
     * le verrou du fil, idempotente : `$responder` y devient participant actif, et tout autre
     * participant actif que le prospect reçoit `left_at`. Le répondant qui revient arrive avec
     * une participation neuve (ni sourdine ni archivage, `joined_at` = maintenant) ; il voit tout
     * l'historique.
     */
    public function transmit(Conversation $conversation, User $responder): void
    {
        DB::transaction(function () use ($conversation, $responder) {
            $locked = Conversation::query()->whereKey($conversation->getKey())->lockForUpdate()->first();
            if ($locked !== null) {
                $this->transmitLocked($locked, $responder);
            }
        });
    }

    /**
     * TCK-888 (ADR-0068 § 3) — transmet au contact principal ACTUEL du bien tous ses fils de
     * prospect. Appelée après leur transaction par les chemins qui déplacent le contact principal
     * par une écriture (désignation, collaboration ajoutée, modifiée ou retirée, passation). Sans
     * contact principal, rien ne bouge : la branche d'accès de TCK-886 ferme déjà le fil.
     *
     * @return int le nombre de fils examinés
     */
    public function transmitForProperty(int $propertyId): int
    {
        $property = Property::withTrashed()->with(self::eagerLoads())->find($propertyId);
        $contact = $property !== null ? $this->recipientFor($property) : null;
        if ($contact === null) {
            return 0;
        }

        $conversations = Conversation::query()
            ->where('property_id', $propertyId)
            ->where('type', ConversationType::Direct->value)
            ->where('created_by', '!=', $contact->id)
            ->orderBy('id')
            ->get();

        foreach ($conversations as $conversation) {
            $this->transmit($conversation, $contact);
        }

        return $conversations->count();
    }

    /** Le corps de {@see self::transmit()}, pour un appelant qui tient déjà le verrou du fil. */
    private function transmitLocked(Conversation $conversation, User $responder): void
    {
        if ((int) $conversation->created_by === (int) $responder->id) {
            return;
        }

        $rows = DB::table('conversation_participants')->where('conversation_id', $conversation->id);
        $current = (clone $rows)->where('user_id', $responder->id)->first();
        $now = now();

        if ($current === null) {
            $conversation->participants()->attach($responder->id, ['joined_at' => $now]);
        } elseif ($current->left_at !== null) {
            (clone $rows)->where('user_id', $responder->id)->update([
                'joined_at' => $now,
                'left_at' => null,
                'is_muted' => false,
                'archived_at' => null,
                'last_read_at' => null,
            ]);
        }

        (clone $rows)
            ->whereNotIn('user_id', [$responder->id, $conversation->created_by])
            ->whereNull('left_at')
            ->update(['left_at' => $now]);
    }

    /**
     * La clause partagée. Elle vit ici, en un seul endroit, parce que `findExisting` et
     * `firstOrCreate` qui divergeraient produiraient exactement le défaut décrit en tête de
     * classe : on ouvre un fil, on écrit dans un autre.
     *
     * TCK-813 (P38.02) — seule une **directe** où le prospect est participant **actif** reçoit le
     * contact : un groupe ouvert sur le bien, ou une directe quittée, ne capte rien.
     *
     * TCK-887 (ADR-0068 § 1 et 3) — le fil est celui du **prospect** (`created_by`) sur ce bien ;
     * le répondant n'est plus un critère de recherche : c'est la transmission qui le met à jour.
     */
    private function query(Property $property, User $user): Builder
    {
        return Conversation::query()
            ->where('property_id', $property->id)
            ->where('type', ConversationType::Direct->value)
            ->where('created_by', $user->id)
            ->whereHas('participants', fn ($q) => $q->where('user_id', $user->id)->whereNull('conversation_participants.left_at'))
            ->orderBy('id');
    }
}
