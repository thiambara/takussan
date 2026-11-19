<?php

namespace App\Services\Pont;

use App\Models\Conversation;
use App\Models\MessageRelay;
use App\Models\User;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\EquipeDuFil;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2980 (ADR-0132 § 2) — OÙ va un message entrant. Ne lit que la forme neutre ({@see MessageEntrant}) : aucun
 * canal n'y est nommé.
 *
 * **Le compte** ({@see self::compte()}) : le numéro VÉRIFIÉ d'un compte (principal ou second), sinon le compte que le
 * pilote tient d'un accord du pont rattaché ({@see CanalDuPont::compteAccordePour()}). Une fiche client au même
 * numéro ne compte PAS : un numéro inconnu n'entre jamais dans un fil.
 *
 * **Le fil** ({@see self::fil()}), dans cet ordre, en sautant tout fil où le compte ne peut pas écrire
 * ({@see ConversationAccess::allowsWriting()} : participant actif, fil ouvert, bail en cours…) :
 *  1. le fil du relais sortant que cite le message ;
 *  2. le fil du dernier relais sortant RATTACHÉ À UN FIL vers ce numéro, depuis ce numéro d'entreprise, de moins de
 *     7 jours (`messagerie.dernier_relais_jours`) ;
 *  3. le fil le plus récemment actif où le compte participe, dont l'agence est celle du numéro ; pour le numéro de la
 *     plateforme, toute agence **si une seule** est en jeu ;
 *  4. sinon `null` : le message devient un prospect. Aucun fil n'est ouvert d'office.
 */
final class RoutageEntrant
{
    /** Combien de fils récents l'étape 3 examine au plus. */
    private const CANDIDATS = 50;

    public function __construct(private readonly ConversationAccess $access) {}

    public function compte(CanalDuPont $canal, string $telephone): ?User
    {
        $verifie = User::query()
            ->where(fn ($q) => $q
                ->where(fn ($w) => $w->where('phone', $telephone)->whereNotNull('phone_verified_at'))
                ->orWhere(fn ($w) => $w->where('secondary_phone', $telephone)->whereNotNull('secondary_phone_verified_at')))
            ->orderBy('id')
            ->first();
        if ($verifie !== null) {
            return $verifie;
        }
        $accorde = $canal->compteAccordePour($telephone);

        return $accorde === null ? null : User::query()->find($accorde);
    }

    /** @param  int|null  $agence  l'agence du numéro d'entreprise (`null` : la plateforme) */
    public function fil(User $compte, MessageEntrant $message, ?int $agence): ?Conversation
    {
        // TCK-2985 (ADR-0132 § 2, § 6) — une réponse au résumé du lundi (cité, ou dernier relais récent) : l'étape 3,
        // restreinte à l'agence du résumé. Un relais de résumé n'a pas de fil : les étapes 1 et 2 n'y mènent nulle part.
        $resume = $this->agenceDuResume($compte, $message);
        if ($resume !== null) {
            return $this->plusRecent($compte, $resume);
        }

        $sortants = fn () => MessageRelay::query()
            ->where('channel', $message->canal)
            ->where('direction', MessageRelay::DIRECTION_OUT)
            ->whereNotNull('conversation_id');

        // 1. Le message cité.
        if ($message->cite !== null) {
            $fil = $this->ecrivable($compte, $sortants()->where('provider_message_id', $message->cite)->value('conversation_id'));
            if ($fil !== null) {
                return $fil;
            }
        }

        // 2. Le dernier relais rattaché à un fil, récent, depuis ce numéro d'entreprise.
        $dernier = $sortants()
            ->where('phone', $message->telephone)
            ->where('business_number_id', $message->numeroDEntreprise)
            ->where('created_at', '>=', now()->subDays((int) config('messagerie.dernier_relais_jours', 7)))
            ->orderByDesc('created_at')->orderByDesc('id')
            ->value('conversation_id');
        $fil = $this->ecrivable($compte, $dernier);
        if ($fil !== null) {
            return $fil;
        }

        // 3. Le fil le plus récemment actif, de l'agence du numéro.
        return $this->plusRecent($compte, $agence);
    }

    /**
     * TCK-2985 (ADR-0132 § 6) — l'agence du résumé du lundi auquel ce message répond : le relais `digest` qu'il cite,
     * sinon le dernier relais sortant (< 7 jours) vers ce numéro depuis ce numéro d'entreprise, s'il est un résumé.
     * Seulement un résumé adressé à CE compte. `null` : le message ne répond pas à un résumé.
     */
    public function agenceDuResume(User $compte, MessageEntrant $message): ?int
    {
        $sortants = fn () => MessageRelay::query()
            ->where('channel', $message->canal)
            ->where('direction', MessageRelay::DIRECTION_OUT);

        $relais = $message->cite !== null
            ? $sortants()->where('provider_message_id', $message->cite)->first(['purpose', 'agency_id', 'user_id'])
            : $sortants()
                ->where('phone', $message->telephone)
                ->where('business_number_id', $message->numeroDEntreprise)
                ->where('created_at', '>=', now()->subDays((int) config('messagerie.dernier_relais_jours', 7)))
                ->orderByDesc('created_at')->orderByDesc('id')
                ->first(['purpose', 'agency_id', 'user_id']);

        if ($relais === null || $relais->purpose !== MessageRelay::PURPOSE_DIGEST
            || (int) $relais->user_id !== (int) $compte->id || $relais->agency_id === null) {
            return null;
        }

        return (int) $relais->agency_id;
    }

    private function plusRecent(User $compte, ?int $agence): ?Conversation
    {
        $candidats = Conversation::query()
            ->whereIn('conversations.id', DB::table('conversation_participants')
                ->where('user_id', $compte->id)->whereNull('left_at')->select('conversation_id'))
            ->select('conversations.*')
            ->selectRaw(EquipeDuFil::agenceSql('conversations').' as agence_du_fil')
            ->when($agence !== null, fn ($q) => $q->whereRaw(EquipeDuFil::agenceSql('conversations').' = ?', [$agence]))
            ->when($agence === null, fn ($q) => $q->whereRaw(EquipeDuFil::agenceSql('conversations').' IS NOT NULL'))
            ->orderByRaw('last_message_at DESC NULLS LAST')->orderByDesc('conversations.id')
            ->limit(self::CANDIDATS)
            ->get()
            ->filter(fn (Conversation $c) => $this->access->allowsWriting($compte, $c))
            ->values();

        // Le numéro de la plateforme : le serveur ne choisit pas l'agence à la place de la personne.
        if ($agence === null && $candidats->pluck('agence_du_fil')->map(fn ($a) => (int) $a)->unique()->count() !== 1) {
            return null;
        }

        return $candidats->first();
    }

    private function ecrivable(User $compte, mixed $conversationId): ?Conversation
    {
        if ($conversationId === null) {
            return null;
        }
        $fil = Conversation::query()->find((int) $conversationId);

        return $fil !== null && $this->access->allowsWriting($compte, $fil) ? $fil : null;
    }
}
