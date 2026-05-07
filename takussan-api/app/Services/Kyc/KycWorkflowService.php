<?php

namespace App\Services\Kyc;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\KycDossier;
use App\Models\User;
use App\Services\Model\NotificationService;
use Illuminate\Http\UploadedFile;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Symfony\Component\HttpKernel\Exception\HttpException;

class KycWorkflowService
{
    public const AGENCY_REQUIRED_DOCUMENTS = ['rccm', 'ninea', 'director_id'];

    public function __construct(private readonly NotificationService $notifications) {}

    public function dossierForAgency(Agency $agency): KycDossier
    {
        return KycDossier::query()->firstOrCreate([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
        ], [
            'status' => KycDossierStatus::Pending,
            'metadata' => [],
        ]);
    }

    public function upload(KycDossier $dossier, UploadedFile $file, string $documentType): Media
    {
        $this->assertNotVerified($dossier);
        abort_unless(in_array($documentType, self::AGENCY_REQUIRED_DOCUMENTS, true), 422, 'Unknown KYC document type.');

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
            throw new HttpException(422, 'Verified KYC dossiers are locked.');
        }
    }

    private function assertTransitionable(KycDossier $dossier): void
    {
        if ($dossier->status !== KycDossierStatus::Submitted) {
            throw new HttpException(422, 'Only submitted KYC dossiers can be reviewed.');
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
            throw new HttpException(422, 'Missing required KYC documents: '.implode(', ', $missing));
        }
    }

    private function notifySubmitted(KycDossier $dossier): void
    {
        $subjectName = $dossier->subject instanceof Agency ? $dossier->subject->name : 'Dossier';
        User::query()
            ->whereHas('roles', fn ($query) => $query->where('name', 'super_admin'))
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
