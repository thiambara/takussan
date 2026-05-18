<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\ServiceProviderProfile;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\File\UploadedFile;

/**
 * TCK-261 — wizard-side endpoints to populate the freshly-claimed
 * ServiceProviderProfile (post-invitation acceptance).
 *
 * The endpoints are mounted under `/api/me/profiles/{sp_profile}/...` so
 * the route signature mirrors the wizard's mental model ("I'm editing
 * MY profile") and keeps the multi-tenant ownership check trivial: the
 * authenticated user must own the row.
 *
 * Storage choices (documented for TCK-257 reuse):
 *  - **trades**     → existing `specialties` json column.
 *  - **zones**      → existing `service_areas` json column.
 *  - **hourly_rate**→ existing `hourly_rate_min` decimal column.
 *  - **visit_fee**  → `metadata.visit_fee` (no dedicated column to avoid
 *                     a migration just for one optional number — promote
 *                     to a column when the booking flow needs to range-query).
 *  - **availability**→`metadata.availability` (array of `{day, from, to}`).
 *  - **kyc**        → `App\Models\Document` polymorph attached to the
 *                     SP profile, with `type` mapped from the upload `kind`.
 *                     Files are stored via the medialibrary `file` collection
 *                     already configured on `Document`. **TCK-257 will
 *                     reuse the same `KycUploader` UI + this endpoint.**
 */
class ServiceProviderProfileController extends Controller
{
    /** Map upload `kind` to `App\Models\Enums\DocumentType`. */
    private const KYC_KIND_TO_TYPE = [
        'cni' => DocumentType::IdCard,
        'insurance' => DocumentType::Insurance,
    ];

    /**
     * POST /api/me/profiles/{sp_profile}/kyc/upload
     *
     * Multipart : `file` + `kind=cni|insurance`.
     */
    public function uploadKyc(Request $request, ServiceProviderProfile $sp_profile): JsonResponse
    {
        $this->assertOwner($request, $sp_profile);

        $validated = $request->validate([
            // 8 MB max, common KYC formats. medialibrary handles MIME by the
            // file extension — we keep the rules permissive to support phone
            // captures (heic, webp).
            'file' => ['required', 'file', 'max:8192'],
            'kind' => ['required', 'string', Rule::in(array_keys(self::KYC_KIND_TO_TYPE))],
        ]);

        /** @var UploadedFile $file */
        $file = $validated['file'];
        $kind = (string) $validated['kind'];
        $type = self::KYC_KIND_TO_TYPE[$kind];

        // One Document row per (profile, kind) — replace previous version
        // by hand to keep `Document::activeVersion()` semantics intact and
        // avoid orphan medialibrary files across re-uploads.
        $document = Document::query()->updateOrCreate(
            [
                'documentable_type' => ServiceProviderProfile::class,
                'documentable_id' => $sp_profile->id,
                'type' => $type,
            ],
            [
                'uploaded_by' => $request->user()->id,
                'name' => $file->getClientOriginalName() ?: ucfirst($kind),
                'description' => null,
                'is_verified' => false,
                'metadata' => ['kind' => $kind, 'source' => 'sp_onboarding_wizard'],
            ],
        );

        // Replace existing media (singleFile collection) so a re-upload
        // doesn't accumulate stale files on disk.
        $document->clearMediaCollection('file');
        $media = $document->addMedia($file->getRealPath())
            ->usingFileName($file->hashName())
            ->usingName($file->getClientOriginalName() ?: $kind)
            ->toMediaCollection('file');

        // Mirror insurance presence onto SP metadata so the wizard recap
        // and the `Assuré` badge can read it without a join.
        if ($kind === 'insurance') {
            $metadata = $sp_profile->metadata ?? [];
            $metadata['has_insurance'] = true;
            $sp_profile->forceFill(['metadata' => $metadata])->save();
        }

        activity('Onboarding')
            ->performedOn($sp_profile)
            ->causedBy($request->user())
            ->withProperties([
                'kind' => $kind,
                'document_id' => $document->id,
                'media_id' => $media->id,
            ])
            ->event('sp_kyc_submitted')
            ->log('sp_kyc_submitted');

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
     * PATCH /api/me/profiles/{sp_profile}/trades
     *
     * Body : `{trades: string[], intervention_zones: string[], hourly_rate, visit_fee}`.
     */
    public function updateTrades(Request $request, ServiceProviderProfile $sp_profile): JsonResponse
    {
        $this->assertOwner($request, $sp_profile);

        $validated = $request->validate([
            'trades' => ['nullable', 'array'],
            'trades.*' => ['string', 'max:60'],
            'intervention_zones' => ['nullable', 'array'],
            'intervention_zones.*' => ['string', 'max:120'],
            'hourly_rate' => ['nullable', 'numeric', 'min:0'],
            'visit_fee' => ['nullable', 'numeric', 'min:0'],
        ]);

        $trades = $this->normaliseStringList($validated['trades'] ?? []);
        $zones = $this->normaliseStringList($validated['intervention_zones'] ?? []);

        $metadata = $sp_profile->metadata ?? [];
        if (array_key_exists('visit_fee', $validated)) {
            if ($validated['visit_fee'] === null) {
                unset($metadata['visit_fee']);
            } else {
                $metadata['visit_fee'] = (float) $validated['visit_fee'];
            }
        }

        $sp_profile->forceFill([
            'specialties' => $trades !== [] ? $trades : null,
            'service_areas' => $zones !== [] ? $zones : null,
            'hourly_rate_min' => array_key_exists('hourly_rate', $validated) && $validated['hourly_rate'] !== null
                ? (float) $validated['hourly_rate']
                : $sp_profile->hourly_rate_min,
            'metadata' => $metadata,
        ])->save();

        return $this->json([
            'data' => [
                'id' => $sp_profile->id,
                'trades' => $trades,
                'intervention_zones' => $zones,
                'hourly_rate' => $sp_profile->hourly_rate_min,
                'visit_fee' => $metadata['visit_fee'] ?? null,
            ],
        ]);
    }

    /**
     * PATCH /api/me/profiles/{sp_profile}/availability
     *
     * Body : `{available_slots: [{day, from, to}, ...]}`.
     *
     * Stored in `metadata.availability` to keep the schema migration-free
     * (TCK-261 hors-périmètre du booking range query).
     */
    public function updateAvailability(Request $request, ServiceProviderProfile $sp_profile): JsonResponse
    {
        $this->assertOwner($request, $sp_profile);

        $validated = $request->validate([
            'available_slots' => ['required', 'array'],
            'available_slots.*.day' => [
                'required',
                'string',
                Rule::in(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
            ],
            'available_slots.*.from' => ['required', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'available_slots.*.to' => ['required', 'string', 'regex:/^\d{2}:\d{2}$/'],
        ]);

        $slots = array_map(static fn (array $slot): array => [
            'day' => (string) $slot['day'],
            'from' => (string) $slot['from'],
            'to' => (string) $slot['to'],
        ], $validated['available_slots']);

        $metadata = $sp_profile->metadata ?? [];
        $metadata['availability'] = $slots;
        $sp_profile->forceFill(['metadata' => $metadata])->save();

        return $this->json([
            'data' => [
                'id' => $sp_profile->id,
                'available_slots' => $slots,
            ],
        ]);
    }

    /**
     * Authorize : only the SP profile owner (or super_admin) may write.
     */
    protected function assertOwner(Request $request, ServiceProviderProfile $sp_profile): void
    {
        $user = $request->user();
        if ($user === null) {
            abort(401);
        }

        if (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
            return;
        }

        if ((int) $sp_profile->user_id !== (int) $user->id) {
            throw new AuthorizationException(__('service_providers.onboarding.errors.not_owner'));
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
