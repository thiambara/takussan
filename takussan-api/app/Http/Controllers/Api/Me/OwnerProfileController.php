<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * TCK-257 — wizard-side endpoints to populate the freshly-claimed
 * OwnerProfile (post-invitation acceptance).
 *
 * Mirrors the SP onboarding controller (TCK-261) :
 *  - Mounted under `/api/me/profiles/{owner_profile}/...` so the route
 *    signature matches the wizard mental model and ownership check stays
 *    trivial.
 *  - KYC documents are persisted via `App\Models\Document` polymorph
 *    attached to the OwnerProfile (one Document row per (profile, kind),
 *    re-uploads replace the medialibrary file in-place).
 *  - Submission state is tracked in `OwnerProfile.metadata.kyc` so we
 *    avoid a dedicated migration just for `submitted_at` (the audit trail
 *    of agency-side review will live in the `KycDossier` model wired up
 *    by the validation/refus ticket — out of scope here).
 *
 * Storage choices (documented for future TCK-258 Agent reuse) :
 *  - `cni`   → `Document` polymorph, type=id_card.
 *  - `rib`   → `Document` polymorph, type=rib.
 *  - `ninea` → `Document` polymorph, type=ninea.
 *  - submission → `OwnerProfile.metadata.kyc.{status, submitted_at, docs[]}`.
 */
class OwnerProfileController extends Controller
{
    /** Map upload `kind` to `App\Models\Enums\DocumentType`. */
    private const KYC_KIND_TO_TYPE = [
        'cni' => DocumentType::IdCard,
        'rib' => DocumentType::Rib,
        'ninea' => DocumentType::Ninea,
    ];

    /**
     * POST /api/me/profiles/{owner_profile}/kyc/upload
     *
     * Multipart : `file` + `kind=cni|rib|ninea`. Idempotent per (profile, kind).
     */
    public function uploadKyc(Request $request, OwnerProfile $owner_profile): JsonResponse
    {
        $this->assertOwner($request, $owner_profile);

        $validated = $request->validate([
            // 8 MB max — phone captures (heic, webp), scans, PDFs.
            'file' => ['required', 'file', 'max:8192'],
            'kind' => ['required', 'string', Rule::in(array_keys(self::KYC_KIND_TO_TYPE))],
        ]);

        /** @var UploadedFile $file */
        $file = $validated['file'];
        $kind = (string) $validated['kind'];
        $type = self::KYC_KIND_TO_TYPE[$kind];

        // One Document per (profile, kind). Re-uploads replace the media
        // file in-place to keep `Document::activeVersion()` semantics
        // intact and avoid orphan files on disk.
        $document = Document::query()->updateOrCreate(
            [
                'documentable_type' => OwnerProfile::class,
                'documentable_id' => $owner_profile->id,
                'type' => $type,
            ],
            [
                'uploaded_by' => $request->user()->id,
                'name' => $file->getClientOriginalName() ?: ucfirst($kind),
                'description' => null,
                'is_verified' => false,
                'metadata' => ['kind' => $kind, 'source' => 'owner_onboarding_wizard'],
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
        $metadata = $owner_profile->metadata ?? [];
        $kyc = $metadata['kyc'] ?? [];
        $kyc['docs'] = array_values(array_unique(array_merge(
            (array) ($kyc['docs'] ?? []),
            [$kind],
        )));
        $metadata['kyc'] = $kyc;
        $owner_profile->forceFill(['metadata' => $metadata])->save();

        activity('Onboarding')
            ->performedOn($owner_profile)
            ->causedBy($request->user())
            ->withProperties([
                'kind' => $kind,
                'document_id' => $document->id,
                'media_id' => $media->id,
            ])
            ->event('owner_kyc_submitted')
            ->log('owner_kyc_submitted');

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
     * POST /api/me/profiles/{owner_profile}/kyc/submit
     *
     * Marks the KYC as submitted (status=pending_review). Non-blocking —
     * the agency-side workflow validates separately. Idempotent.
     */
    public function submitKyc(Request $request, OwnerProfile $owner_profile): JsonResponse
    {
        $this->assertOwner($request, $owner_profile);

        $metadata = $owner_profile->metadata ?? [];
        $kyc = $metadata['kyc'] ?? [];
        $alreadySubmitted = ! empty($kyc['submitted_at']);

        $kyc['status'] = 'pending_review';
        $kyc['submitted_at'] = $kyc['submitted_at'] ?? now()->toIso8601String();
        $metadata['kyc'] = $kyc;
        $owner_profile->forceFill(['metadata' => $metadata])->save();

        if (! $alreadySubmitted) {
            activity('Onboarding')
                ->performedOn($owner_profile)
                ->causedBy($request->user())
                ->withProperties([
                    'docs' => (array) ($kyc['docs'] ?? []),
                ])
                ->event('owner_kyc_submitted')
                ->log('owner_kyc_submitted');
        }

        return $this->json([
            'data' => [
                'id' => $owner_profile->id,
                'kyc' => [
                    'status' => $kyc['status'],
                    'submitted_at' => $kyc['submitted_at'],
                    'docs' => (array) ($kyc['docs'] ?? []),
                ],
            ],
        ]);
    }

    /**
     * GET /api/me/owner-profiles/{owner_profile}/properties
     *
     * Liste des biens pré-rattachés à l'Owner. Le schema `Property` lie
     * un bien à son propriétaire via `user_id` (User) et `agency_id` —
     * pas de FK directe `owner_profile_id` (volontaire : un même User
     * peut être bailleur dans plusieurs agences). On filtre donc par
     * `(user_id = $owner_profile->user_id AND agency_id = $owner_profile->agency_id)`.
     *
     * Spatie HasQueryBuilder pour `fields[]`, `filter[]`, `include=`, `sort=`.
     */
    public function properties(Request $request, OwnerProfile $owner_profile): JsonResponse
    {
        $this->assertOwner($request, $owner_profile);

        $base = Property::query()
            ->when($owner_profile->user_id !== null, fn (Builder $q) => $q->where('user_id', $owner_profile->user_id))
            ->when($owner_profile->user_id === null, fn (Builder $q) => $q->whereRaw('1 = 0'))
            ->when($owner_profile->agency_id !== null, fn (Builder $q) => $q->where('agency_id', $owner_profile->agency_id));

        $paginator = Property::buildQuery($base, $request)
            ->defaultSort('-created_at')
            ->paginate((int) $request->input('per_page', 20));

        return $this->json([
            'data' => $paginator->items(),
            'meta' => $this->paginationMeta($paginator),
        ]);
    }

    /**
     * Authorize : only the Owner profile owner (or super_admin) may write.
     */
    protected function assertOwner(Request $request, OwnerProfile $owner_profile): void
    {
        $user = $request->user();
        if ($user === null) {
            abort(401);
        }

        if (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return;
        }

        if ((int) $owner_profile->user_id !== (int) $user->id) {
            throw new AuthorizationException(__('owners.onboarding.errors.not_owner'));
        }
    }
}
