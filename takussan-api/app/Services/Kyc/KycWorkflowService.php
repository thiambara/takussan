<?php

namespace App\Services\Kyc;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\KycDossier;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Http\UploadedFile;
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

    public function upload(KycDossier $dossier, UploadedFile $file, string $documentType): Media
    {
        $this->assertNotVerified($dossier);
        if (! in_array($documentType, self::AGENCY_REQUIRED_DOCUMENTS, true)) {
            abort_code(422, self::CODE_UNKNOWN_DOCUMENT_TYPE);
        }

        return $dossier
            ->addMedia($file)
            ->usingFileName(str()->slug($documentType).'.'.strtolower($file->getClientOriginalExtension()))
            ->withCustomProperties(['document_type' => $documentType])
            ->toMediaCollection('documents');
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

        $dossier->update([
            'status' => KycDossierStatus::Verified,
            'reviewed_at' => now(),
            'reviewed_by' => $actor->id,
            'rejection_reason' => null,
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
        $subjectName = $dossier->subject instanceof Agency ? $dossier->subject->name : 'Dossier';
        User::query()
            ->whereHas('platformProfile', fn ($query) => $query
                ->whereNull('revoked_at')
                ->where('level', PlatformProfileLevel::SuperAdmin->value))
            ->get()
            ->each(function (User $user) use ($dossier, $subjectName): void {
                $this->notifications->notify(
                    user: $user,
                    type: NotificationType::System,
                    title: 'KYC agence à instruire',
                    body: "Le dossier KYC de {$subjectName} a été soumis.",
                    data: ['event' => 'kyc_submitted', 'dossier_id' => $dossier->id],
                    channel: NotificationChannel::App,
                    referenceableType: 'kyc_dossier',
                    referenceableId: $dossier->id,
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

        $this->notifications->notify(
            user: $admin,
            type: NotificationType::System,
            title: $verified ? 'KYC agence vérifié' : 'KYC agence rejeté',
            body: $verified
                ? 'Votre dossier KYC a été vérifié.'
                : 'Votre dossier KYC a été rejeté : '.$dossier->rejection_reason,
            data: [
                'event' => $verified ? 'kyc_verified' : 'kyc_rejected',
                'dossier_id' => $dossier->id,
                'rejection_reason' => $dossier->rejection_reason,
            ],
            channel: NotificationChannel::App,
            referenceableType: 'kyc_dossier',
            referenceableId: $dossier->id,
        );
    }
}
