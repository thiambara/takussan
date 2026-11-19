<?php

namespace App\Services\Messaging;

use App\Jobs\NotifyNewMessageJob;
use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Message;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use Closure;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2782 — LE point d'écriture d'un message au nom d'un utilisateur, dans une conversation de l'API.
 *
 * Trois chemins écrivaient chacun le leur : l'envoi (`POST /api/conversations/{id}/messages`), le message
 * initial d'une directe (`POST /api/conversations`) et celui d'un groupe. Seul l'envoi jugeait
 * {@see ConversationAccess::allowsWriting()} ; les deux autres ne tenaient qu'aux gardes de création
 * (`GuardsConversationScope::guardContext()`, {@see MessagingReach}). Or une directe REPRISE par
 * {@see DirectConversationService::firstOrCreate()} n'est pas une création : c'est un envoi dans un fil
 * existant. Toute règle ajoutée à `allowsWriting` devait être recopiée dans les gardes de création, ou
 * elle était contournée — relevé du 2026-11-13 : un profil non actif autre que `blocked`/`inactive`
 * (le `draft`, que l'application ne rattache jamais à un compte) écrivait par le message initial
 * dans un fil où l'envoi lui rendait 403.
 *
 * Ici, l'écriture est jugée AVANT tout écrit, par la même règle que l'envoi : refusée, elle rend 403
 * avec le corps de `SendMessageConversationRequest` (`http.forbidden`), sans message ni notification.
 *
 * Hors de cette règle, chacun pour sa raison (garde `EcritureDeMessageUniqueTest`) :
 *  - le contact public d'une annonce (`PublicPropertyController::contactMessage()`) est la porte du
 *    visiteur, jugée par son propre formulaire ; un bailleur suspendu y écrit à sa propre annonce comme
 *    tout visiteur (décision y q2 du 2026-11-13) ;
 *  - un avis système ({@see SystemMessageFactory}) n'a pas d'auteur.
 */
class ConversationWriter
{
    public function __construct(private readonly ConversationAccess $access) {}

    /**
     * Écrit le message de `$author` dans `$conversation` : le message, le pointeur du fil, le marqueur de
     * lecture de l'auteur et le désarchivage, en une transaction ; puis `NotifyNewMessageJob`.
     *
     * Appelé dans une transaction ouverte (la directe ou le groupe créés dans la même requête), un refus
     * l'annule entière. La notification part dans une file `after_commit` (`config/queue.php`, TCK-1802) :
     * elle n'est jamais vue avant le COMMIT, ni du tout après une annulation.
     *
     * TCK-2965 (ADR-0128 § 6) — `visibility` : `team` écrit une note d'équipe ({@see self::refuserLaNote()}).
     * Une note ne touche pas l'aperçu commun du fil (`last_message_*`), et ne fait reparaître le fil
     * archivé que chez ceux qui la lisent.
     *
     * TCK-2966 (ADR-0128 § 6) — `mentions` : les comptes mentionnés, rangés dans `metadata.mentions`
     * ({@see MentionsDuFil::normaliser()}). Refusées en 422 `messaging.mention_type` hors d'un texte ou
     * d'une note vocale (une carte, un événement, un avis n'en portent pas). Qui peut être mentionné se
     * juge à l'envoi (`SendMessageConversationRequest`) et au départ (`NotifyNewMessageJob`).
     *
     * @param  array{content: string, type: string, metadata?: array<string, mixed>|null, visibility?: string|null, mentions?: list<int>|null}  $attributes
     * @param  (Closure(Message): void)|null  $joindre  la pièce du message (note vocale, photo, PDF), rangée
     *                                                  dans la transaction, avant le pointeur du fil
     */
    public function post(User $author, Conversation $conversation, array $attributes, ?Closure $joindre = null): Message
    {
        abort_unless($this->access->allowsWriting($author, $conversation), 403);

        $visibility = MessageVisibility::tryFrom((string) ($attributes['visibility'] ?? '')) ?? MessageVisibility::All;
        $note = $visibility === MessageVisibility::Team;
        if ($note) {
            $this->refuserLaNote($author, $conversation, (string) $attributes['type']);
        }

        // TCK-2966 — les mentions, dans le `metadata` du message, sur un texte ou une note vocale seulement.
        $mentions = MentionsDuFil::normaliser($attributes['mentions'] ?? null);
        abort_code_if($mentions !== [] && ! MentionsDuFil::typePorteUneMention((string) $attributes['type']), 422, 'messaging.mention_type');
        $metadata = $attributes['metadata'] ?? null;
        if ($mentions !== []) {
            $metadata = array_merge($metadata ?? [], [MentionsDuFil::CLE => $mentions]);
        }

        $message = DB::transaction(function () use ($author, $conversation, $attributes, $joindre, $visibility, $note, $metadata) {
            $message = $conversation->messages()->create([
                'sender_id' => $author->id,
                'content' => $attributes['content'],
                'type' => $attributes['type'],
                'metadata' => $metadata,
                'visibility' => $visibility->value,
            ]);

            if ($joindre !== null) {
                $joindre($message);
            }

            // TCK-2965 — une note d'équipe ne touche jamais l'aperçu commun de la liste.
            if (! $note) {
                $conversation->update([
                    'last_message_id' => $message->id,
                    // TCK-2631 — l'aperçu d'une pièce est neutre (« Photo », « Document »), légende ou non.
                    'last_message_preview' => mb_substr($message->neutralPreview() ?? $message->content, 0, 255),
                    'last_message_at' => now(),
                ]);
            }

            // L'auteur a lu son propre message, et le fil lui revient s'il l'avait archivé.
            $conversation->participants()->updateExistingPivot($author->id, [
                'last_read_at' => now(),
                'archived_at' => null,
            ]);

            // Un message entrant fait reparaître le fil dans la liste des autres participants.
            // TCK-2965 — une note, chez ceux qui la lisent seulement : un client ne voit pas son fil
            // archivé revenir sans message.
            DB::table('conversation_participants')
                ->where('conversation_id', $conversation->id)
                ->where('user_id', '!=', $author->id)
                ->when($note, fn ($q) => $q->whereIn('user_id', EquipeDuFil::idsDesLecteursDesNotes((int) $conversation->id)))
                ->update(['archived_at' => null]);

            return $message;
        });

        NotifyNewMessageJob::dispatch($message->id);

        return $message;
    }

    /**
     * TCK-2965 (ADR-0128 § 6) — une note d'équipe est refusée en 422 : pour un type qui n'est ni un
     * texte, ni une note vocale, ni une pièce jointe (une carte, un événement, un avis sont toujours
     * `all`) ; dans un fil sans agence ; pour un auteur qui n'est pas personnel actif de l'agence du fil
     * sous son profil actif (un client, un bailleur, l'agent d'une autre agence).
     */
    private function refuserLaNote(User $author, Conversation $conversation, string $type): void
    {
        $typesDeNote = array_map(fn (MessageType $t): string => $t->value, MessageVisibility::typesDeNote());
        abort_code_if(! in_array($type, $typesDeNote, true), 422, 'messaging.team_note_type');

        $agence = EquipeDuFil::agence($conversation);
        abort_code_if($agence === null, 422, 'messaging.team_note_no_agency');
        abort_code_if(! PersonnelDeLAgence::personnelActifDe($author, $agence), 422, 'messaging.team_note_not_staff');
    }
}
