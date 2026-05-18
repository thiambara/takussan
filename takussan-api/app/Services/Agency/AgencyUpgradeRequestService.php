<?php

namespace App\Services\Agency;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Document;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\DocumentType;
use App\Models\User;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Policies\AgencyUpgradeRequestPolicy;
use App\Services\Auth\SuperAdminCooptationService;
use App\Services\Invitation\OwnerInvitationService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Spatie\Permission\PermissionRegistrar;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * TCK-267 — agency-side service for the `individual → standard` upgrade
 * lifecycle.
 *
 * Scope is intentionally limited to **submission + revoke**:
 *  - The super-admin review console lives in TCK-268.
 *  - The actual `Agency.kind` flip + feature unlock lives in TCK-269.
 *
 * The policy ({@see AgencyUpgradeRequestPolicy}) is the
 * canonical authorisation surface; the service re-checks the same gates
 * defensively so direct (non-HTTP) callers can't bypass them.
 */
class AgencyUpgradeRequestService
{
    /**
     * Submit a new pending request for `$agency`.
     *
     * Steps:
     *  1. Re-assert the agency is `individual` and the submitter is an
     *     `agency_admin` scoped to that agency's team_id.
     *  2. Pre-check for an existing pending request — TCK-252 enforces
     *     uniqueness at the DB level (partial unique index on Postgres,
     *     applicative fallback on SQLite), but we surface a 422 with a
     *     clear message rather than letting the QueryException bubble.
     *  3. Persist the request + attach the uploaded `statuts_doc` as a
     *     polymorphic Document (with a media item) inside one transaction.
     *  4. Activity-log `agency_upgrade_requested` with both the agency id
     *     and the planned agents count for downstream analytics.
     *  5. Notify every super-admin via
     *     {@see AgencyUpgradeRequestSubmittedNotification} (database+mail).
     *
     * @param  array{rc:string, ninea:string, rib_pro:string, company_legal_name:string, address_fiscale:string, planned_agents_count?:int|null}  $data
     */
    public function submit(
        Agency $agency,
        User $submitter,
        array $data,
        ?UploadedFile $statutsDoc,
    ): AgencyUpgradeRequest {
        $this->assertAgencyIsIndividual($agency);
        $this->assertSubmitterIsAgencyAdmin($submitter, $agency);
        $this->assertNoPendingRequest($agency);

        $request = DB::transaction(function () use ($agency, $submitter, $data, $statutsDoc): AgencyUpgradeRequest {
            $request = AgencyUpgradeRequest::query()->create([
                'agency_id' => $agency->id,
                'submitted_by' => $submitter->id,
                'rc' => trim((string) $data['rc']),
                'ninea' => trim((string) $data['ninea']),
                'rib_pro' => trim((string) $data['rib_pro']),
                'company_legal_name' => trim((string) $data['company_legal_name']),
                'address_fiscale' => trim((string) $data['address_fiscale']),
                'planned_agents_count' => isset($data['planned_agents_count'])
                    ? (int) $data['planned_agents_count']
                    : null,
                'status' => AgencyUpgradeRequestStatus::Pending->value,
                'submitted_at' => now(),
            ]);

            if ($statutsDoc instanceof UploadedFile) {
                $document = Document::query()->create([
                    'documentable_id' => $request->id,
                    'documentable_type' => AgencyUpgradeRequest::class,
                    'uploaded_by' => $submitter->id,
                    'name' => 'statuts.'.$statutsDoc->getClientOriginalExtension(),
                    'type' => DocumentType::Other->value,
                    'description' => 'Statuts juridiques — demande upgrade agence',
                    'is_verified' => false,
                ]);

                $document->addMedia($statutsDoc->getRealPath())
                    ->usingFileName($statutsDoc->getClientOriginalName())
                    ->toMediaCollection('file');
            }

            activity('AgencyUpgradeRequest')
                ->performedOn($request)
                ->causedBy($submitter)
                ->withProperties([
                    'agency_id' => $agency->id,
                    'submitted_by' => $submitter->id,
                    'planned_agents_count' => $request->planned_agents_count,
                ])
                ->event('agency_upgrade_requested')
                ->log('agency_upgrade_requested');

            return $request;
        });

        $this->notifySuperAdmins($request, $submitter);

        return $request;
    }

    /**
     * Revoke a pending request. Terminal — no reopening.
     *
     * @throws HttpException 422 if the request is not pending.
     */
    public function revoke(AgencyUpgradeRequest $request, User $actor): AgencyUpgradeRequest
    {
        $status = $request->status instanceof AgencyUpgradeRequestStatus
            ? $request->status
            : AgencyUpgradeRequestStatus::tryFrom((string) $request->status);

        if ($status !== AgencyUpgradeRequestStatus::Pending) {
            throw new HttpException(422, __('agency_upgrade.revoke.errors.not_pending'));
        }

        $request->update([
            'status' => AgencyUpgradeRequestStatus::Revoked->value,
        ]);

        activity('AgencyUpgradeRequest')
            ->performedOn($request)
            ->causedBy($actor)
            ->withProperties([
                'agency_id' => $request->agency_id,
                'revoked_by' => $actor->id,
            ])
            ->event('agency_upgrade_revoked')
            ->log('agency_upgrade_revoked');

        return $request->fresh();
    }

    /**
     * Throws 403 if the agency is already standard. The endpoint is a
     * no-op in that case; the FE pre-empts visibility but the service
     * re-checks defensively.
     */
    protected function assertAgencyIsIndividual(Agency $agency): void
    {
        $kind = $agency->kind instanceof AgencyKind
            ? $agency->kind
            : AgencyKind::tryFrom((string) $agency->kind);

        if ($kind !== AgencyKind::Individual) {
            throw new HttpException(403, __('agency_upgrade.submit.errors.not_individual'));
        }
    }

    /**
     * Throws 403 unless `$submitter` carries the `agency_admin` role under
     * the agency's team_id context. We pin the spatie team_id explicitly
     * for the same reason as {@see OwnerInvitationService}:
     * a user who is `agency_admin` of *another* agency must not pass the
     * gate here.
     */
    /**
     * TCK-278 — Profile-based check (cf. policy).
     */
    protected function assertSubmitterIsAgencyAdmin(User $submitter, Agency $agency): void
    {
        if ($submitter->isSuperAdmin()) {
            return;
        }

        if (! $submitter->isAgencyAdminAt((int) $agency->id)) {
            throw new HttpException(403, __('agency_upgrade.submit.errors.permission_denied'));
        }
    }

    /**
     * Throws 422 with the existing request id when there is already a
     * pending one — softer than letting the unique constraint blow up
     * inside the transaction with a generic 500.
     */
    protected function assertNoPendingRequest(Agency $agency): void
    {
        $existing = AgencyUpgradeRequest::query()
            ->where('agency_id', $agency->id)
            ->pending()
            ->first();

        if ($existing !== null) {
            throw new HttpException(422, __('agency_upgrade.submit.errors.pending_exists', [
                'request_id' => $existing->id,
            ]));
        }
    }

    /**
     * Fan-out to every super-admin (`team_id = null` global role).
     */
    protected function notifySuperAdmins(AgencyUpgradeRequest $request, User $submitter): void
    {
        $recipients = $this->resolveSuperAdmins();
        if ($recipients->isEmpty()) {
            return;
        }

        Notification::send(
            $recipients,
            new AgencyUpgradeRequestSubmittedNotification($request, $submitter),
        );
    }

    /**
     * Resolve every user holding the global `super_admin` role.
     *
     * Mirrors {@see SuperAdminCooptationService::superAdmins()}
     * — kept self-contained here to avoid coupling the upgrade flow to
     * the cooptation surface.
     *
     * @return Collection<int, User>
     */
    public function resolveSuperAdmins(): Collection
    {
        $registrar = app(PermissionRegistrar::class);
        $previous = $registrar->getPermissionsTeamId();
        $registrar->setPermissionsTeamId(null);

        try {
            $teamColumn = config('permission.column_names.team_foreign_key', 'team_id');

            return User::query()
                ->whereHas('roles', function ($query) use ($teamColumn): void {
                    $query->where('roles.name', 'super_admin')
                        ->whereNull('roles.'.$teamColumn);
                })
                ->get();
        } finally {
            $registrar->setPermissionsTeamId($previous);
        }
    }
}
