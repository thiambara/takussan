<?php

namespace App\Services\Messaging\Copilote;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Messaging\ConversationAccess;
use App\Services\Messaging\EquipeDuFil;
use App\Support\ImpersonationContext;

/**
 * TCK-2974 (ADR-0131 § 1) — qui a le copilote d'un fil : le personnel ACTIF de l'agence du fil, et lui seul.
 *
 * {@see self::peutServir()} est vrai si, et seulement si, le lecteur :
 *  - est personnel actif de l'agence du fil sous son profil actif ({@see PersonnelDeLAgence::personnelActifDe()}) ;
 *  - participe ACTIVEMENT au fil ;
 *  - lit le fil ({@see ConversationAccess::allows()}).
 *
 * Écrite depuis ses briques, jamais par `EquipeDuFil::litLesNotes()` ni par `allows()` seul : tous deux disent
 * vrai pour le super-admin, qui n'est pas personnel de l'agence. Un fil sans agence n'a pas de copilote. Un
 * bailleur à qui une agence aurait accordé `messaging.copilot` par un rôle reste refusé : il n'est pas personnel.
 *
 * La capacité `messaging.copilot` se juge EN PLUS ({@see self::autorise()}), et la passerelle la rejuge
 * (`AiAuthority`, `AiRequest::$agencyId` = l'agence du fil).
 */
final class GardeDuCopilote
{
    public function __construct(
        private readonly ConversationAccess $acces,
        private readonly ReglagesDuCopilote $reglages,
    ) {}

    public function peutServir(User $lecteur, Conversation $fil): bool
    {
        $agence = EquipeDuFil::agence($fil);
        if ($agence === null) {
            return false;
        }
        if (! PersonnelDeLAgence::personnelActifDe($lecteur, $agence)) {
            return false;
        }

        return $fil->participants()->where('user_id', $lecteur->id)->wherePivotNull('left_at')->exists()
            && $this->acces->allows($lecteur, $fil);
    }

    /** La garde ET la capacité `messaging.copilot` pour l'agence du fil : ce que la route exige avant tout. */
    public function autorise(User $lecteur, Conversation $fil): bool
    {
        if (! $this->peutServir($lecteur, $fil)) {
            return false;
        }
        $agence = Agency::query()->find(EquipeDuFil::agence($fil));

        return $agence !== null && $lecteur->canActAt(Capability::MessagingCopilot, $agence);
    }

    /**
     * Le booléen `copilote` d'une PAGE de fils, en lot : la capacité jugée une fois (une seule agence, celle du
     * profil actif), les réglages lus une fois, puis UNE requête sur les identifiants de la page
     * ({@see EquipeDuFil::filsOuLesNotesSeLisent()} : participant actif ET agence du fil = agence du personnel).
     * Les fils de la page sont déjà ceux que le lecteur lit (liste cloisonnée, ou `show` gardé).
     *
     * Pour le personnel qui a le copilote du fil : `{fonctions: {<fonction>: {active, raison}}}`, pour que l'écran
     * dise pourquoi une fonction est coupée ({@see ReglagesDuCopilote::fonctions()}). Pour tout autre lecteur :
     * `false`, sans raison.
     *
     * @param  list<int>  $ids
     * @return array<int, false|array{fonctions: array<string, array{active: bool, raison: string|null}>}>
     */
    public function disponiblesParmi(User $lecteur, array $ids): array
    {
        $resultat = array_fill_keys($ids, false);
        // Sous impersonation, toute requête au copilote est refusée (`CopiloteRequest`) : le booléen le dit aussi.
        if ($ids === [] || $lecteur->isSuperAdmin() || app(ImpersonationContext::class)->active()) {
            return $resultat;
        }
        $agences = PersonnelDeLAgence::agencesOuPersonnelActif($lecteur);
        $agence = $agences === [] ? null : Agency::query()->find($agences[0]);
        if ($agence === null || ! $lecteur->canActAt(Capability::MessagingCopilot, $agence)) {
            return $resultat;
        }
        $etat = ['fonctions' => $this->reglages->fonctions($agence)];

        $fils = EquipeDuFil::filsOuLesNotesSeLisent($lecteur);
        if ($fils === null) {
            return $resultat;
        }
        foreach ($fils->whereIn('cn.id', $ids)->pluck('cn.id') as $id) {
            $resultat[(int) $id] = $etat;
        }

        return $resultat;
    }
}
