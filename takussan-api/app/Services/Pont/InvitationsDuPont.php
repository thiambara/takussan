<?php

namespace App\Services\Pont;

use App\Jobs\EmettreLesLiensALaJonction;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Lease;
use App\Models\MessageRelay;
use App\Models\User;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Messaging\SystemMessageFactory;

/**
 * TCK-2981 (ADR-0132 § 3) — « Joindre par WhatsApp » un participant du fil.
 *
 * L'accord vaut pour le NUMÉRO, pas pour le fil : un numéro déjà `opted_in` par le pont (`pont_invitation`,
 * `pont_start`) pour CE compte, sur un canal du repli, est joint d'emblée, sans invitation ; un `opted_in` d'une autre
 * source (alerte de recherche) ne vaut pas accord ({@see CanalDuPont::compteAccordePour()}). Sinon l'invitation part
 * par l'ordre de repli, sur un canal qui porte un bouton de réponse (un SMS ne recueille pas d'accord).
 *
 * @return string|null un code d'erreur `pont.*`, ou null
 */
final class InvitationsDuPont
{
    public function __construct(
        private readonly RelaisSortant $relais,
        private readonly JointsParLePont $joints,
        private readonly SystemMessageFactory $avis,
    ) {}

    public function joindre(Conversation $fil, User $cible): ?string
    {
        $participant = $fil->participants()->where('users.id', $cible->id)->wherePivotNull('left_at')->exists();
        if (! $participant) {
            return 'pont.not_participant';
        }
        if ((string) $cible->phone === '') {
            return 'pont.no_phone';
        }
        $telephone = self::telephone($cible);
        if ($telephone === null) {
            return 'pont.invalid_phone';
        }
        if ($this->relais->oppose($telephone)) {
            return 'pont.opted_out';
        }
        if ($this->joints->etat($fil, $cible->id) === JointsParLePont::JOINT) {
            return 'pont.already_joined';
        }
        if (self::numeroPorteAilleurs($telephone, (int) $cible->id)) {
            return 'pont.numero_deja_a_un_compte';
        }

        $agence = EquipeDuFil::agence($fil);
        $base = [
            'purpose' => MessageRelay::PURPOSE_INVITATION,
            'direction' => MessageRelay::DIRECTION_OUT,
            'conversation_id' => $fil->id,
            'agency_id' => $agence,
            'user_id' => $cible->id,
            'phone' => $telephone,
        ];

        // L'accord déjà donné au pont pour ce compte, sur un canal du repli : joint d'emblée.
        foreach ($this->relais->canaux() as $canal) {
            if ($canal->capacites()->recoit && $canal->accord($telephone) === EtatDAccord::Accorde && $canal->compteAccordePour($telephone) === $cible->id) {
                MessageRelay::query()->create($base + ['channel' => $canal->nom(), 'status' => MessageRelay::STATUS_ACCEPTE]);
                $this->avis->avisDuPont($fil, SystemMessageFactory::AVIS_PONT_ACCORD, ['user_id' => $cible->id, 'channel' => $canal->nom()]);
                // TCK-2982 (ADR-0132 § 5) — joint d'emblée : les gestes que ce fil attend d'elle émettent leur lien.
                EmettreLesLiensALaJonction::dispatch((int) $fil->id, $cible->id)->afterCommit();

                return null;
            }
        }

        $invitation = MessageRelay::query()->create($base + ['status' => MessageRelay::STATUS_NON_ENVOYE]);
        $this->envoyerLInvitation($invitation, $fil, $telephone, $agence, $cible->preferredLocale() ?? (string) config('app.locale'));

        return null;
    }

    /**
     * TCK-2981 (ADR-0132 § 2, décision du porteur du 2026-11-19) — « Joindre » la fiche du locataire SANS COMPTE du
     * bail de cette salle. L'invitation part au numéro de la fiche ; seule la réponse à SON bouton, venue de ce
     * numéro, crée le compte ({@see AccordDuPont}). Un numéro déjà porté par un compte (principal ou second, vérifié
     * ou non) est refusé : aucune fusion.
     */
    public function joindreFiche(Conversation $fil, Customer $fiche): ?string
    {
        $bail = $fil->lease_id === null ? null : Lease::query()->find($fil->lease_id);
        if ($bail === null || (int) $bail->tenant_id !== (int) $fiche->id) {
            return 'pont.customer_not_in_room';
        }
        if ($fiche->user_id !== null) {
            $compte = User::query()->find($fiche->user_id);

            return $compte === null ? 'pont.customer_not_in_room' : $this->joindre($fil, $compte);
        }
        if ((string) $fiche->phone === '') {
            return 'pont.no_phone';
        }
        $telephone = self::normaliser((string) $fiche->phone);
        if ($telephone === null) {
            return 'pont.invalid_phone';
        }
        if ($this->relais->oppose($telephone)) {
            return 'pont.opted_out';
        }
        if (self::numeroPorteParUnCompte($telephone)) {
            return 'pont.numero_deja_a_un_compte';
        }

        $agence = EquipeDuFil::agence($fil);
        $invitation = MessageRelay::query()->create([
            'purpose' => MessageRelay::PURPOSE_INVITATION,
            'direction' => MessageRelay::DIRECTION_OUT,
            'conversation_id' => $fil->id,
            'agency_id' => $agence,
            'customer_id' => $fiche->id,
            'phone' => $telephone,
            'status' => MessageRelay::STATUS_NON_ENVOYE,
        ]);
        $this->envoyerLInvitation($invitation, $fil, $telephone, $agence, (string) config('app.locale'));

        return null;
    }

    private function envoyerLInvitation(MessageRelay $invitation, Conversation $fil, string $telephone, ?int $agence, string $langue): void
    {
        $nomDAgence = $agence === null ? 'Takussan' : (string) (Agency::query()->whereKey($agence)->value('name') ?? 'Takussan');
        $sujet = (string) ($fil->subject ?? '');
        $texte = __('pont.invitation', ['agence' => $nomDAgence, 'sujet' => $sujet], $langue);
        $envoi = $this->relais->envoyer($telephone, $agence, $texte, 'pont_invitation', $langue, [$nomDAgence, $sujet], AccordDuPont::charge($invitation), exigeBoutons: true);
        if ($envoi !== null) {
            $this->relais->tracer($invitation, $envoi['canal'], $envoi['resultat']);
        }
    }

    /** Un numéro saisi, ramené à E.164 s'il en a déjà la forme (séparateurs retirés) ; sinon `null`. */
    public static function normaliser(string $saisi): ?string
    {
        $telephone = preg_replace('/[\s.\-]/', '', $saisi);

        return preg_match('/^\+[1-9]\d{6,14}$/', (string) $telephone) === 1 ? (string) $telephone : null;
    }

    /** Ce numéro est-il porté par un compte, principal ou second, VÉRIFIÉ OU NON (la fiche sans compte) ? */
    public static function numeroPorteParUnCompte(string $telephone): bool
    {
        return User::query()->where(fn ($q) => $q->where('phone', $telephone)->orWhere('secondary_phone', $telephone))->exists();
    }

    /** Le numéro d'un compte, rangé en E.164 ; le pont ne le devine pas (chaque pilote le remet à sa forme). */
    public static function telephone(User $compte): ?string
    {
        return self::normaliser((string) $compte->phone);
    }

    /** Ce numéro est-il vérifié sur un AUTRE compte (principal ou second numéro) ? */
    public static function numeroPorteAilleurs(string $telephone, int $saufCompte): bool
    {
        return User::query()->where('id', '!=', $saufCompte)
            ->where(fn ($q) => $q
                ->where(fn ($w) => $w->where('phone', $telephone)->whereNotNull('phone_verified_at'))
                ->orWhere(fn ($w) => $w->where('secondary_phone', $telephone)->whereNotNull('secondary_phone_verified_at')))
            ->exists();
    }
}
