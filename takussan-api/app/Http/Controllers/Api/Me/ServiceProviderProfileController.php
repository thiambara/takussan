<?php

namespace App\Http\Controllers\Api\Me;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\Me\ShowOriginRequestServiceProviderProfileRequest;
use App\Http\Requests\Api\Me\ShowServiceProviderProfileRequest;
use App\Http\Requests\Api\Me\UpdateAvailabilityServiceProviderProfileRequest;
use App\Http\Requests\Api\Me\UpdateTradesServiceProviderProfileRequest;
use App\Http\Requests\Api\Me\UploadKycServiceProviderProfileRequest;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\ServiceProviderProfile;
use App\Services\Kyc\ProfilePieces;
use App\Services\Media\PrivateMediaAccess;
use App\Services\Onboarding\ServiceProviderOnboardingService;
use Illuminate\Http\JsonResponse;
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
 *                     already configured on `Document`. Called by « Vos
 *                     pièces » (`/app/pieces`, TCK-2614), the only screen
 *                     that uploads a profile's pieces (TCK-2796).
 */
class ServiceProviderProfileController extends Controller
{
    /** Map upload `kind` to `App\Models\Enums\DocumentType`. */
    /**
     * POST /api/me/profiles/{sp_profile}/kyc/upload
     *
     * Multipart : `file` + `kind=cni|insurance`.
     */
    public function uploadKyc(UploadKycServiceProviderProfileRequest $request, ServiceProviderProfile $sp_profile): JsonResponse
    {

        $validated = $request->validated();

        /** @var UploadedFile $file */
        $file = $validated['file'];
        $kind = (string) $validated['kind'];
        $type = UploadKycServiceProviderProfileRequest::KYC_KIND_TO_TYPE[$kind];

        // One Document row per (profile, kind) — replace previous version
        // by hand to keep `Document::activeVersion()` semantics intact and
        // avoid orphan medialibrary files across re-uploads.
        // TCK-1063 (P64.04) — vide aussi `verified_by`/`verified_at`, et journalise la vérification remplacée.
        $document = app(ProfilePieces::class)->upsert($sp_profile, $type, $request->user(), [
            'name' => $file->getClientOriginalName() ?: ucfirst($kind),
            'description' => null,
            'metadata' => ['kind' => $kind, 'source' => 'sp_onboarding_wizard'],
        ]);

        // TCK-1026 (P64.05) — la collection `singleFile` retire l'ancien fichier APRÈS l'ajout du
        // nouveau : un ajout qui échoue garde la pièce, et rien ne s'accumule sur le disque.
        $media = $document->addMedia($file->getRealPath())
            ->usingFileName($file->hashName())
            ->usingName($file->getClientOriginalName() ?: $kind)
            ->toMediaCollection('file');

        // TCK-1325 (P117.06) — plus de `metadata.has_insurance` : le badge « Assuré » se dérive de
        // la pièce vivante (`ServiceProviderProfile::liveInsuranceDocuments()`). Le drapeau n'avait
        // aucun lecteur et ne se remettait jamais à faux.

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
                'uploaded_at' => $this->instant($document->created_at),
            ],
        ], 201);
    }

    /**
     * GET /api/me/profiles/{sp_profile}
     *
     * TCK-592 (P16) — ce que la section prestataire du profil édite : métiers, zones, tarifs,
     * disponibilités. `metadata.availability` n'avait aucun lecteur.
     */
    public function show(ShowServiceProviderProfileRequest $request, ServiceProviderProfile $sp_profile): JsonResponse
    {
        return $this->json(['data' => $this->presenter($sp_profile)]);
    }

    /**
     * GET /api/me/profiles/{sp_profile}/intervention-d-origine
     *
     * TCK-2613 — la demande d'intervention que l'agence a jointe à l'invitation, montrée au prestataire AVANT la
     * fin d'onboarding (encore non assignée : la policy de la demande la lui refuserait). `{data: null}` quand il
     * n'y en a pas, ou plus — les raisons ne se distinguent pas ({@see ServiceProviderOnboardingService::demandeDOrigine()}).
     *
     * Une projection minimale, comme la demande que voit un prestataire avant d'accepter (TCK-592, P6) : le titre,
     * la catégorie, le quartier et la ville du bien, une photo, un devis s'il y en a. **Jamais** la rue, les
     * coordonnées, le demandeur ni son téléphone.
     */
    public function originRequest(ShowOriginRequestServiceProviderProfileRequest $request, ServiceProviderProfile $sp_profile): JsonResponse
    {
        $mr = app(ServiceProviderOnboardingService::class)->demandeDOrigine($sp_profile, $request->user());

        return $this->json(['data' => $mr === null ? null : $this->projectionDOrigine($mr, $request->champs())]);
    }

    /**
     * @param  list<string>  $champs
     * @return array<string, mixed>
     */
    private function projectionDOrigine(MaintenanceRequest $mr, array $champs): array
    {
        $projection = ['id' => $mr->id];
        if (in_array('title', $champs, true)) {
            $projection['title'] = $mr->title;
        }
        if (in_array('category', $champs, true)) {
            $projection['category'] = $mr->category?->value;
        }
        if (in_array('place', $champs, true)) {
            $adresse = $mr->property?->address;
            $projection['place'] = ['quarter' => $adresse?->neighborhood, 'city' => $adresse?->city];
        }
        if (in_array('photo', $champs, true)) {
            $media = $mr->getFirstMedia('photos');
            $acces = app(PrivateMediaAccess::class);
            $projection['photo'] = $media === null ? null : [
                'url' => $url = $acces->signedUrl($media),
                'thumbnail_url' => $acces->signedConversionUrl($media, 'thumbnail') ?? $url,
                'count' => $mr->getMedia('photos')->count(),
            ];
        }
        if (in_array('quote', $champs, true)) {
            $projection['quote'] = $mr->quote_submitted_at === null || $mr->quote_amount === null
                ? null
                : ['amount' => self::montant($mr->quote_amount), 'currency' => $mr->quote_currency];
        }

        return $projection;
    }

    /**
     * TCK-1777 (P95.04) — la projection du `show`, que `updateAvailability` rend aussi
     * (ADR-0071 : une écriture rend la projection de son `show`).
     *
     * @return array{id: int, trades: array<int, string>, intervention_zones: array<int, string>, hourly_rate: mixed, visit_fee: mixed, available_slots: array<int, mixed>}
     */
    private function presenter(ServiceProviderProfile $sp_profile): array
    {
        $metadata = $sp_profile->metadata ?? [];

        return [
            'id' => $sp_profile->id,
            'trades' => $sp_profile->specialties ?? [],
            'intervention_zones' => $sp_profile->service_areas ?? [],
            'hourly_rate' => self::montant($sp_profile->hourly_rate_min),
            'visit_fee' => $metadata['visit_fee'] ?? null,
            'available_slots' => $metadata['availability'] ?? [],
        ];
    }

    /**
     * PATCH /api/me/profiles/{sp_profile}/trades
     *
     * Body : `{trades: string[], intervention_zones: string[], hourly_rate, visit_fee}`.
     */
    public function updateTrades(UpdateTradesServiceProviderProfileRequest $request, ServiceProviderProfile $sp_profile): JsonResponse
    {

        $validated = $request->validated();

        // TCK-592 (P16) — la section du profil édite un réglage à la fois : une clé ABSENTE garde la
        // valeur en base. Elle était lue comme une liste vide, et effaçait les métiers à chaque
        // édition des zones.
        $trades = array_key_exists('trades', $validated)
            ? $this->normaliseStringList($validated['trades'] ?? [])
            : ($sp_profile->specialties ?? []);
        $zones = array_key_exists('intervention_zones', $validated)
            ? $this->normaliseStringList($validated['intervention_zones'] ?? [])
            : ($sp_profile->service_areas ?? []);

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
            // TCK-1315 (P117.02) — comme `visit_fee` : clé absente, on garde ; `null`, on efface.
            'hourly_rate_min' => array_key_exists('hourly_rate', $validated)
                ? ($validated['hourly_rate'] !== null ? (float) $validated['hourly_rate'] : null)
                : $sp_profile->hourly_rate_min,
            'metadata' => $metadata,
        ])->save();

        return $this->json([
            'data' => [
                'id' => $sp_profile->id,
                'trades' => $trades,
                'intervention_zones' => $zones,
                'hourly_rate' => self::montant($sp_profile->hourly_rate_min),
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
    public function updateAvailability(UpdateAvailabilityServiceProviderProfileRequest $request, ServiceProviderProfile $sp_profile): JsonResponse
    {

        $validated = $request->validated();

        $slots = array_map(static fn (array $slot): array => [
            'day' => (string) $slot['day'],
            'from' => (string) $slot['from'],
            'to' => (string) $slot['to'],
        ], $validated['available_slots']);

        $metadata = $sp_profile->metadata ?? [];
        $metadata['availability'] = $slots;
        $sp_profile->forceFill(['metadata' => $metadata])->save();

        return $this->json(['data' => $this->presenter($sp_profile)]);
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

    /**
     * TCK-1290 (P94.05) — `hourly_rate_min` est `decimal:2` (chaîne `"4500.00"`) : rendu en nombre,
     * comme `visit_fee` et les montants de `PaymentController`. `null` reste `null`.
     */
    private static function montant(mixed $valeur): ?float
    {
        return $valeur === null ? null : (float) $valeur;
    }
}
