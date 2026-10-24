<?php

namespace App\Services\Account;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Agency\AgentPortfolio;
use App\Services\Membership\AdminsDeLAgence;
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
 */
class ErasedMemberPortfolio
{
    public function __construct(
        private readonly AgentPortfolio $portfolio,
        private readonly NotificationService $notifications,
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
}
