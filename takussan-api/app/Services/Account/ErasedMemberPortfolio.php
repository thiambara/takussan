<?php

namespace App\Services\Account;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Task;
use App\Models\User;
use App\Services\Agency\AgentPortfolio;
use App\Services\Membership\AdminsDeLAgence;
use App\Services\Model\MaintenanceRequestService;
use App\Services\Model\NotificationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Angle 204 — le portefeuille qu'un membre du personnel laisse à l'effacement de son compte.
 *
 * TCK-2164 (P204.01, décision du porteur du 2026-10-24) : à la DEMANDE d'effacement, les
 * administrateurs de chaque agence où le portefeuille ({@see AgentPortfolio}) n'est pas vide en
 * reçoivent l'inventaire, pour le passer pendant le délai de grâce par l'assistant existant. Le
 * compte n'est pas encore supprimé : il reste dans l'équipe, et la passation s'ouvre depuis sa ligne.
 *
 * TCK-2168 (P204.03) : à l'EXÉCUTION, ce qui reste est libéré — {@see self::release()}.
 */
class ErasedMemberPortfolio
{
    public function __construct(
        private readonly AgentPortfolio $portfolio,
        private readonly NotificationService $notifications,
        private readonly MaintenanceRequestService $maintenance,
    ) {}

    /** Les agences où le compte est encore du personnel (profil d'agent ou d'admin non terminé). */
    public function staffAgencies(User $member): Collection
    {
        $ids = AgentProfile::query()->where('user_id', $member->id)->pluck('agency_id')
            ->merge(AgencyAdminProfile::query()->where('user_id', $member->id)->pluck('agency_id'))
            ->filter()
            ->unique()
            ->values();

        return Agency::query()->whereIn('id', $ids)->orderBy('id')->get();
    }

    public function notifyAgencies(User $member, Carbon $scheduledFor): void
    {
        $name = $member->full_name ?: ($member->email ?: (string) $member->phone);
        $target = NotificationTarget::of('team');
        $url = rtrim((string) config('app.frontend_url'), '/').$target->path();

        foreach ($this->staffAgencies($member) as $agency) {
            $inventory = $this->portfolio->inventory($agency, $member);
            if (array_sum($inventory) === 0) {
                continue;
            }

            $params = ['member' => $name, 'scheduled_for' => $scheduledFor->toDateString(), 'url' => $url];
            foreach (array_keys(NotificationCode::AgencyMemberDeletionRequested->params()) as $key) {
                if (array_key_exists($key, $inventory)) {
                    $params[$key] = $inventory[$key];
                }
            }

            foreach (AdminsDeLAgence::destinataires((int) $agency->id) as $admin) {
                if ($admin->id === $member->id) {
                    continue;
                }
                $this->notifications->send($admin, NotificationCode::AgencyMemberDeletionRequested, $params, $target->forAgency($agency->id));
            }
        }
    }

    /**
     * TCK-2168 (P204.03, décision du porteur du 2026-10-24) — à l'exécution, APRÈS la suppression
     * du compte (les avis de désassignation ne lui partent plus) et AVANT la fin de ses profils
     * (qui dit s'il était du personnel de l'agence du bien) :
     *  - les tâches ouvertes retombent sans assigné ;
     *  - une intervention non close d'un bien d'une agence dont il est du personnel passe par
     *    `assign(…, null, keepQuote: true)`, le chemin de la passation : son devis reste ;
     *  - une intervention dont il est le prestataire passe par `unassignProviderFromAgency()`,
     *    le chemin de la fin d'une collaboration : elle revient au donneur d'ordre.
     * Une intervention `completed` garde son assigné : le travail est rendu.
     */
    public function release(User $member): void
    {
        Task::query()
            ->where('assigned_to_id', $member->id)
            ->whereIn('status', array_map(fn ($s) => $s->value, Task::OPEN_STATUSES))
            ->update(['assigned_to_id' => null, 'updated_at' => now()]);

        $requests = MaintenanceRequest::query()
            ->where('assigned_to', $member->id)
            ->whereNotIn('status', AgentPortfolio::CLOSED_MAINTENANCE)
            ->with(['property' => fn ($q) => $q->withTrashed()])
            ->orderBy('id')
            ->get();

        $staffAgencyIds = $this->staffAgencies($member)->pluck('id')->map(fn ($id) => (int) $id)->all();
        $providerAgencyIds = [];
        foreach ($requests as $mr) {
            $agencyId = $mr->property?->agency_id !== null ? (int) $mr->property->agency_id : null;
            if ($agencyId !== null && in_array($agencyId, $staffAgencyIds, true)) {
                $this->maintenance->assign($mr, null, null, keepQuote: true);
            } elseif ($agencyId !== null) {
                $providerAgencyIds[$agencyId] = true;
            }
        }
        foreach (array_keys($providerAgencyIds) as $agencyId) {
            $this->maintenance->unassignProviderFromAgency($member, $agencyId, null);
        }
    }
}
