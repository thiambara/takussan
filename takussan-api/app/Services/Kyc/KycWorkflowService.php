<?php

namespace App\Services\Kyc;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\KycDossier;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class KycWorkflowService
{
    public const AGENCY_REQUIRED_DOCUMENTS = ['rccm', 'ninea', 'director_id'];

    /**
     * Les codes stables que les refus de ce service émettent, en plus de leur `message`.
     *
     * TCK-362 — le code est la DONNÉE dont le front a besoin pour posséder son texte (principe non
     * négociable n°5). TCK-588 (ADR-0032) — ils passent par `abort_code()` : le `message` est
     * désormais localisé dans la langue de la requête (`lang/{fr,en,wo}/errors.php`, clés `kyc.*`), et la
     * réponse construite à la main (`HttpResponseException`, qui contournait le rendu de
     * `bootstrap/app.php`) a disparu. Les codes sont inchangés.
     */
    public const CODE_LOCKED = 'kyc.locked';

    public const CODE_UNKNOWN_DOCUMENT_TYPE = 'kyc.unknown_document_type';

    public const CODE_NOT_TRANSITIONABLE = 'kyc.not_transitionable';

    public const CODE_DOCUMENTS_MISSING = 'kyc.documents_missing';

    public function __construct(private readonly NotificationService $notifications) {}

    /**
     * ⚠ `->load('subject')` n'est pas décoratif — TCK-362.
     *
     * Cette méthode sert `GET /api/admin/agencies/{a}/kyc` et `GET /api/agencies/{a}/kyc`, qui ne
     * passent PAS par `buildQuery` : l'`include=subject` que le front envoie sur ces deux routes
     * n'y a aucun effet, et `KycDossierResource::whenLoaded('subject')` omettait le champ **en
     * silence**. Un `include` ignoré sans erreur est un piège posé pour le prochain appelant : il
     * lit `subject`, obtient `undefined`, et cherche le défaut côté front.
     */
    public function dossierForAgency(Agency $agency): KycDossier
    {
        return KycDossier::query()->firstOrCreate([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
        ], [
            'status' => KycDossierStatus::Pending,
            'metadata' => [],
        ])->load('subject');
    }

    /** @param  string|null  $expiresAt  échéance de la pièce (`Y-m-d`), exigée pour `director_id` */
    public function upload(KycDossier $dossier, UploadedFile $file, string $documentType, ?string $expiresAt = null): Media
    {
        $this->assertNotVerified($dossier);
        if (! in_array($documentType, self::AGENCY_REQUIRED_DOCUMENTS, true)) {
            abort_code(422, self::CODE_UNKNOWN_DOCUMENT_TYPE);
        }

        return $dossier
            ->addMedia($file)
            ->usingFileName(str()->slug($documentType).'.'.strtolower($file->getClientOriginalExtension()))
            ->withCustomProperties(array_filter(['document_type' => $documentType, 'expires_at' => $expiresAt]))
            ->toMediaCollection('documents');
    }

    /**
     * TCK-601 (ADR-0044 §5) — l'échéance du dossier : la plus petite parmi les pièces les plus
     * RÉCENTES de chaque type. Une pièce remplacée ne compte plus — l'ancienne pièce d'identité
     * expirée qu'un nouveau dépôt remplace ne doit pas faire expirer le dossier. Le jour d'échéance
     * à 00:00 : ce jour-là, la pièce n'est plus valable.
     */
    public function expiryOf(KycDossier $dossier): ?Carbon
    {
        $dates = $dossier->getMedia('documents')
            ->sortByDesc(fn (Media $media) => [$media->created_at?->getTimestamp(), $media->getKey()])
            ->unique(fn (Media $media) => $media->getCustomProperty('document_type'))
            ->map(fn (Media $media) => $media->getCustomProperty('expires_at'))
            ->filter(fn ($date) => is_string($date) && $date !== '')
            ->map(fn (string $date) => Carbon::parse($date)->startOfDay());

        return $dates->isEmpty() ? null : $dates->sort()->first();
    }

    public function submit(KycDossier $dossier, User $actor): KycDossier
    {
        $this->assertNotVerified($dossier);
        $this->assertRequiredDocuments($dossier);

        $dossier->update([
            'status' => KycDossierStatus::Submitted,
            'submitted_at' => now(),
            'rejection_reason' => null,
        ]);

        activity('KYC')
            ->causedBy($actor)
            ->performedOn($dossier)
            ->event('kyc_submitted')
            ->log('Dossier KYC soumis');

        $this->notifySubmitted($dossier);

        return $dossier->refresh();
    }

    public function verify(KycDossier $dossier, User $actor): KycDossier
    {
        $this->assertTransitionable($dossier);
        $this->assertRequiredDocuments($dossier);

        $metadata = $dossier->metadata ?? [];
        // Une nouvelle vérification ouvre une nouvelle échéance : ses relances repartent de zéro.
        unset($metadata['expiry_reminders'], $metadata['expired_at']);

        $dossier->update([
            'status' => KycDossierStatus::Verified,
            'reviewed_at' => now(),
            'reviewed_by' => $actor->id,
            'rejection_reason' => null,
            'expires_at' => $this->expiryOf($dossier),
            'metadata' => $metadata,
        ]);

        if ($dossier->subject instanceof Agency) {
            $dossier->subject->update([
                'status' => AgencyStatus::Active,
                'is_verified' => true,
                'verified_at' => now(),
            ]);
        }

        activity('KYC')
            ->causedBy($actor)
            ->performedOn($dossier)
            ->event('kyc_verified')
            ->log('Dossier KYC vérifié');

        $this->notifyReviewed($dossier, verified: true);

        return $dossier->refresh();
    }

    public function reject(KycDossier $dossier, User $actor, string $reason): KycDossier
    {
        $this->assertTransitionable($dossier);

        $dossier->update([
            'status' => KycDossierStatus::Rejected,
            'reviewed_at' => now(),
            'reviewed_by' => $actor->id,
            'rejection_reason' => $reason,
        ]);

        activity('KYC')
            ->causedBy($actor)
            ->performedOn($dossier)
            ->event('kyc_rejected')
            ->withProperties(['reason' => $reason])
            ->log('Dossier KYC rejeté');

        $this->notifyReviewed($dossier, verified: false);

        return $dossier->refresh();
    }

    private function assertNotVerified(KycDossier $dossier): void
    {
        if ($dossier->status === KycDossierStatus::Verified) {
            abort_code(422, self::CODE_LOCKED);
        }
    }

    private function assertTransitionable(KycDossier $dossier): void
    {
        if ($dossier->status !== KycDossierStatus::Submitted) {
            abort_code(422, self::CODE_NOT_TRANSITIONABLE);
        }
    }

    private function assertRequiredDocuments(KycDossier $dossier): void
    {
        $present = $dossier->getMedia('documents')
            ->map(fn (Media $media) => $media->getCustomProperty('document_type'))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $missing = array_values(array_diff(self::AGENCY_REQUIRED_DOCUMENTS, $present));
        if ($missing !== []) {
            abort_code(422, self::CODE_DOCUMENTS_MISSING, ['missing' => $missing]);
        }
    }

    private function notifySubmitted(KycDossier $dossier): void
    {
        $subjectName = $dossier->subject instanceof Agency ? $dossier->subject->name : null;
        User::query()
            ->whereHas('platformProfile', fn ($query) => $query
                ->whereNull('revoked_at')
                ->where('level', PlatformProfileLevel::SuperAdmin->value))
            ->get()
            ->each(function (User $user) use ($subjectName): void {
                $this->notifications->send(
                    $user,
                    NotificationCode::KycSubmitted,
                    ['agency' => $subjectName],
                    NotificationTarget::of('kyc_review'),
                );
            });
    }

    private function notifyReviewed(KycDossier $dossier, bool $verified): void
    {
        $agency = $dossier->subject instanceof Agency ? $dossier->subject : null;
        $admin = $agency?->primaryAdmin;
        if (! $admin) {
            return;
        }

        // TCK-588 — le verdict obéit à `kyc_status_changed` (critique : in-app et e-mail
        // toujours), et non plus à « Alerte seuil KPI » par le type `system`.
        $this->notifications->send(
            $admin,
            $verified ? NotificationCode::KycVerified : NotificationCode::KycRejected,
            $verified ? [] : ['reason' => $dossier->rejection_reason],
            NotificationTarget::of('agency_kyc'),
        );
    }
}
