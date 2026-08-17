<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\UpdateSpecializationAgentProfileRequest;
use App\Http\Requests\Api\Me\UploadKycAgentProfileRequest;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Profiles\AgentProfile;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * TCK-259 — wizard-side endpoints to populate the freshly-claimed
 * AgentProfile (post-invitation acceptance).
 *
 * Mirrors the Owner / SP onboarding controllers (TCK-257 / TCK-261) :
 *  - Mounted under `/api/me/agent-profiles/{agent_profile}/...` so the
 *    route signature matches the wizard mental model and ownership check
 *    stays trivial (auth user must own the row).
 *  - KYC documents are persisted via `App\Models\Document` polymorph
 *    attached to the AgentProfile (one Document row per (profile, kind),
 *    re-uploads replace the medialibrary file in-place).
 *  - Submission state tracked in `AgentProfile.metadata.kyc` to avoid a
 *    dedicated migration just for `submitted_at` (the agency-side review
 *    workflow is out of scope — separate ticket).
 *
 * Storage choices :
 *  - `license` → `Document` polymorph, type=other (license card scan).
 *  - `cni`     → `Document` polymorph, type=id_card.
 *  - `photo`   → `Document` polymorph, type=photo.
 *  - submission → `AgentProfile.metadata.kyc.{status, submitted_at, docs[]}`.
 *  - `license_number` (string) → existing `agent_profiles.license_number`
 *    column (already nullable). The KYC card scan stays in `Document`.
 *  - `specialty` (string)        → existing `agent_profiles.specialty` column
 *    (single-value enum-string ; the front uses `specialization` as the
 *    UX label but the schema field is named `specialty` — see
 *    `AgentProfileFactory`). Validated against a fixed enum.
 *  - `intervention_zones` (string[]) → `metadata.intervention_zones` (no
 *    dedicated column to avoid a migration ; mirrors SP `service_areas`
 *    semantics — promote when a booking flow needs to range-query).
 */
class AgentProfileController extends Controller
{
    /** Map upload `kind` to `App\Models\Enums\DocumentType`. */
    /**
     * POST /api/me/agent-profiles/{agent_profile}/kyc/upload
     *
     * Multipart : `file` + `kind=license|cni|photo`. Idempotent per (profile, kind).
     */
    public function uploadKyc(UploadKycAgentProfileRequest $request, AgentProfile $agent_profile): JsonResponse
    {
        $this->assertOwner($request, $agent_profile);

        $validated = $request->validated();

        /** @var UploadedFile $file */
        $file = $validated['file'];
        $kind = (string) $validated['kind'];
        $type = UploadKycAgentProfileRequest::KYC_KIND_TO_TYPE[$kind];

        // One Document per (profile, kind). Re-uploads replace the media
        // file in-place to keep `Document::activeVersion()` semantics
        // intact and avoid orphan files on disk.
        $document = Document::query()->updateOrCreate(
            [
                'documentable_type' => AgentProfile::class,
                'documentable_id' => $agent_profile->id,
                'type' => $type,
            ],
            [
                'uploaded_by' => $request->user()->id,
                'name' => $file->getClientOriginalName() ?: ucfirst($kind),
                'description' => null,
                'is_verified' => false,
                'metadata' => ['kind' => $kind, 'source' => 'agent_onboarding_wizard'],
            ],
        );

        $document->clearMediaCollection('file');
        $media = $document->addMedia($file->getRealPath())
            ->usingFileName($file->hashName())
            ->usingName($file->getClientOriginalName() ?: $kind)
            ->toMediaCollection('file');

        // Mirror the doc presence in `metadata.kyc.docs` so the wizard
        // recap and the dashboard banner can read submission progress
        // without a join.
        $metadata = $agent_profile->metadata ?? [];
        $kyc = $metadata['kyc'] ?? [];
        $kyc['docs'] = array_values(array_unique(array_merge(
            (array) ($kyc['docs'] ?? []),
            [$kind],
        )));
        $metadata['kyc'] = $kyc;
        $agent_profile->forceFill(['metadata' => $metadata])->save();

        activity('Onboarding')
            ->performedOn($agent_profile)
            ->causedBy($request->user())
            ->withProperties([
                'kind' => $kind,
                'document_id' => $document->id,
                'media_id' => $media->id,
            ])
            ->event('agent_kyc_submitted')
            ->log('agent_kyc_submitted');

        return $this->json([
            'data' => [
                'id' => $document->id,
                'kind' => $kind,
                'type' => $type->value,
                'media_id' => $media->id,
                'file_name' => $document->name,
                'uploaded_at' => $document->created_at?->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * POST /api/me/agent-profiles/{agent_profile}/kyc/submit
     *
     * Marks the KYC as submitted (status=pending_review). Non-blocking —
     * the agency-side workflow validates separately. Idempotent.
     */
    public function submitKyc(Request $request, AgentProfile $agent_profile): JsonResponse
    {
        $this->assertOwner($request, $agent_profile);

        $metadata = $agent_profile->metadata ?? [];
        $kyc = $metadata['kyc'] ?? [];
        $alreadySubmitted = ! empty($kyc['submitted_at']);

        $kyc['status'] = 'pending_review';
        $kyc['submitted_at'] = $kyc['submitted_at'] ?? now()->toIso8601String();
        $metadata['kyc'] = $kyc;
        $agent_profile->forceFill(['metadata' => $metadata])->save();

        if (! $alreadySubmitted) {
            activity('Onboarding')
                ->performedOn($agent_profile)
                ->causedBy($request->user())
                ->withProperties([
                    'docs' => (array) ($kyc['docs'] ?? []),
                ])
                ->event('agent_kyc_submitted')
                ->log('agent_kyc_submitted');
        }

        return $this->json([
            'data' => [
                'id' => $agent_profile->id,
                'kyc' => [
                    'status' => $kyc['status'],
                    'submitted_at' => $kyc['submitted_at'],
                    'docs' => (array) ($kyc['docs'] ?? []),
                ],
            ],
        ]);
    }

    /**
     * PATCH /api/me/agent-profiles/{agent_profile}/specialization
     *
     * Body : `{specialization, intervention_zones[], license_number?}`.
     * `specialization` lands on the `specialty` column (schema name) ;
     * `intervention_zones` lands on `metadata.intervention_zones`.
     */
    public function updateSpecialization(UpdateSpecializationAgentProfileRequest $request, AgentProfile $agent_profile): JsonResponse
    {
        $this->assertOwner($request, $agent_profile);

        $validated = $request->validated();

        $zones = $this->normaliseStringList($validated['intervention_zones'] ?? []);

        $metadata = $agent_profile->metadata ?? [];
        $metadata['intervention_zones'] = $zones;

        $patch = [
            'specialty' => (string) $validated['specialization'],
            'metadata' => $metadata,
        ];
        if (array_key_exists('license_number', $validated) && $validated['license_number'] !== null) {
            $patch['license_number'] = trim((string) $validated['license_number']);
        }
        $agent_profile->forceFill($patch)->save();

        return $this->json([
            'data' => [
                'id' => $agent_profile->id,
                'specialization' => $agent_profile->specialty,
                'intervention_zones' => $zones,
                'license_number' => $agent_profile->license_number,
            ],
        ]);
    }

    /**
     * GET /api/me/agent-profiles/{agent_profile}/first-lead
     *
     * Returns the first Customer pre-assigned to this agent. The current
     * schema has no dedicated `assigned_agent_id` column on customers —
     * we use `customers.added_by_id = $agent_profile->user_id` + scope
     * by agency as a heuristic for "leads given to this agent".
     * Returns `{customer: null}` (200) when no lead exists.
     */
    public function firstLead(Request $request, AgentProfile $agent_profile): JsonResponse
    {
        $this->assertOwner($request, $agent_profile);

        $customer = Customer::query()
            ->where('added_by_id', $agent_profile->user_id)
            ->when($agent_profile->agency_id !== null, fn ($q) => $q->where('agency_id', $agent_profile->agency_id))
            ->orderBy('id')
            ->first(['id', 'first_name', 'last_name', 'email', 'phone', 'pipeline_stage', 'agency_id']);

        if ($customer === null) {
            return $this->json(['data' => ['customer' => null]]);
        }

        return $this->json([
            'data' => [
                'customer' => [
                    'id' => $customer->id,
                    'first_name' => $customer->first_name,
                    'last_name' => $customer->last_name,
                    'full_name' => trim((string) $customer->first_name.' '.(string) $customer->last_name),
                    'email' => $customer->email,
                    'phone' => $customer->phone,
                    'pipeline_stage' => $customer->pipeline_stage?->value,
                ],
            ],
        ]);
    }

    /**
     * Authorize : only the Agent profile owner (or super_admin) may write.
     */
    protected function assertOwner(Request $request, AgentProfile $agent_profile): void
    {
        $user = $request->user();
        if ($user === null) {
            abort(401);
        }

        if (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return;
        }

        if ((int) $agent_profile->user_id !== (int) $user->id) {
            throw new AuthorizationException(__('team.onboarding.errors.not_owner'));
        }
    }

    /**
     * @param  array<int, mixed>  $values
     * @return array<int, string>
     */
    protected function normaliseStringList(mixed $values): array
    {
        if (! is_array($values)) {
            return [];
        }

        $out = [];
        foreach ($values as $value) {
            if (! is_string($value)) {
                continue;
            }
            $trimmed = trim($value);
            if ($trimmed === '') {
                continue;
            }
            if (! in_array($trimmed, $out, true)) {
                $out[] = $trimmed;
            }
        }

        return $out;
    }
}
