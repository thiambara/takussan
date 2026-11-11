<?php

namespace App\Services\Kyc;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Capability;
use App\Models\Enums\KycDossierStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\KycDossier;
use App\Models\User;
use App\Services\Membership\AdminsDeLAgence;
use App\Services\Model\NotificationService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
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

    /**
     * TCK-2669 (ADR-0104 § 7) — la fenêtre de renouvellement : sur un dossier vérifié, la pièce du
     * dirigeant expirée ou expirant dans ce nombre de jours se remplace. C'est la première relance
     * ({@see KycExpiryService::REMINDER_DAYS}).
     */
    public const RENEWAL_WINDOW_DAYS = 30;

    /** TCK-2669 — la seule pièce qui expire, donc la seule qui se renouvelle sur un dossier vérifié. */
    public const RENEWABLE_DOCUMENT = 'director_id';

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

    /**
     * @param  string|null  $expiresAt  échéance de la pièce (`Y-m-d`), exigée pour `director_id`
     * @param  string|null  $documentNumber  TCK-2669 — le numéro porté par une pièce RCCM ou NINEA
     */
    public function upload(KycDossier $dossier, UploadedFile $file, string $documentType, ?string $expiresAt = null, ?string $documentNumber = null, ?User $actor = null): Media
    {
        if ($dossier->status === KycDossierStatus::Verified) {
            return $this->renew($dossier, $file, $documentType, $expiresAt, $documentNumber, $actor);
        }
        if (! in_array($documentType, self::AGENCY_REQUIRED_DOCUMENTS, true)) {
            abort_code(422, self::CODE_UNKNOWN_DOCUMENT_TYPE);
        }

        return $this->attach($dossier, $file, $documentType, $expiresAt, $documentNumber);
    }

    /**
     * TCK-2669 (ADR-0104 § 7) — sur un dossier VÉRIFIÉ, seule la pièce du dirigeant expirée ou
     * expirant sous {@see self::RENEWAL_WINDOW_DAYS} jours se remplace ; tout autre envoi reste
     * refusé (`kyc.locked`). Le dossier passe `submitted` et les super-admins sont prévenus, comme à
     * une soumission. L'échéance du dossier reste celle de l'ancienne pièce jusqu'à la
     * vérification, et `agencies.is_verified` ne bouge pas : c'est `kyc:expire-dossiers` qui le
     * retire à cette échéance si le renouvellement n'est pas vérifié d'ici là.
     */
    private function renew(KycDossier $dossier, UploadedFile $file, string $documentType, ?string $expiresAt, ?string $documentNumber, ?User $actor): Media
    {
        [$locked, $media] = DB::transaction(function () use ($dossier, $file, $documentType, $expiresAt, $documentNumber, $actor): array {
            $locked = $this->lock($dossier);
            // Expiré entre la lecture et le verrou : un dépôt ordinaire, sans transition.
            if ($locked->status !== KycDossierStatus::Verified) {
                return [null, $this->attach($locked, $file, $documentType, $expiresAt, $documentNumber)];
            }
            $this->assertNotVerified($locked, $documentType);

            $media = $this->attach($locked, $file, $documentType, $expiresAt, $documentNumber);
            $locked->update([
                'status' => KycDossierStatus::Submitted,
                'submitted_at' => now(),
                'rejection_reason' => null,
            ]);

            activity('KYC')
                ->causedBy($actor)
                ->performedOn($locked)
                ->withProperties(['renewal' => true, 'previous_expires_at' => $locked->expires_at?->toIso8601String()])
                ->event('kyc_submitted')
                ->log('Dossier KYC soumis');

            return [$locked, $media];
        });

        if ($locked !== null) {
            $this->notifySubmitted($locked);
        }

        return $media;
    }

    private function attach(KycDossier $dossier, UploadedFile $file, string $documentType, ?string $expiresAt, ?string $documentNumber): Media
    {
        return $dossier
            ->addMedia($file)
            ->usingFileName(str()->slug($documentType).'.'.strtolower($file->getClientOriginalExtension()))
            ->withCustomProperties(array_filter(['document_type' => $documentType, 'expires_at' => $expiresAt, 'document_number' => $documentNumber]))
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

    /**
     * P211.01 (TCK-2105) — `submit`, `verify` et `reject` relisent le dossier sous verrou dans une
     * transaction, et y jugent leur garde : jugée sur le modèle lié à la route, deux super-admins
     * qui tranchaient ensemble passaient tous deux, et laissaient un dossier `rejected` derrière une
     * agence vérifiée. L'écriture de l'agence est dans la même transaction ; l'avis part après.
     */
    public function submit(KycDossier $dossier, User $actor): KycDossier
    {
        $locked = DB::transaction(function () use ($dossier, $actor): KycDossier {
            $locked = $this->lock($dossier);
            $this->assertNotVerified($locked);
            $this->assertRequiredDocuments($locked);

            $locked->update([
                'status' => KycDossierStatus::Submitted,
                'submitted_at' => now(),
                'rejection_reason' => null,
            ]);

            activity('KYC')
                ->causedBy($actor)
                ->performedOn($locked)
                ->event('kyc_submitted')
                ->log('Dossier KYC soumis');

            return $locked;
        });

        $this->notifySubmitted($locked);

        return $locked->refresh();
    }

    public function verify(KycDossier $dossier, User $actor): KycDossier
    {
        $locked = DB::transaction(function () use ($dossier, $actor): KycDossier {
            $locked = $this->lock($dossier);
            $this->assertTransitionable($locked);
            $this->assertRequiredDocuments($locked);

            $metadata = $locked->metadata ?? [];
            // Une nouvelle vérification ouvre une nouvelle échéance : ses relances repartent de zéro.
            unset($metadata['expiry_reminders'], $metadata['expired_at']);

            $locked->update([
                'status' => KycDossierStatus::Verified,
                'reviewed_at' => now(),
                'reviewed_by' => $actor->id,
                'rejection_reason' => null,
                'expires_at' => $this->expiryOf($locked),
                'metadata' => $metadata,
            ]);

            if ($locked->subject instanceof Agency) {
                $locked->subject->update([
                    'status' => AgencyStatus::Active,
                    'is_verified' => true,
                    'verified_at' => now(),
                ]);
            }

            activity('KYC')
                ->causedBy($actor)
                ->performedOn($locked)
                ->event('kyc_verified')
                ->log('Dossier KYC vérifié');

            return $locked;
        });

        $this->notifyReviewed($locked, verified: true);

        return $locked->refresh();
    }

    public function reject(KycDossier $dossier, User $actor, string $reason): KycDossier
    {
        $locked = DB::transaction(function () use ($dossier, $actor, $reason): KycDossier {
            $locked = $this->lock($dossier);
            $this->assertTransitionable($locked);

            $locked->update([
                'status' => KycDossierStatus::Rejected,
                'reviewed_at' => now(),
                'reviewed_by' => $actor->id,
                'rejection_reason' => $reason,
            ]);

            activity('KYC')
                ->causedBy($actor)
                ->performedOn($locked)
                ->event('kyc_rejected')
                ->withProperties(['reason' => $reason])
                ->log('Dossier KYC rejeté');

            return $locked;
        });

        $this->notifyReviewed($locked, verified: false);

        return $locked->refresh();
    }

    private function lock(KycDossier $dossier): KycDossier
    {
        return KycDossier::query()->whereKey($dossier->getKey())->lockForUpdate()->firstOrFail();
    }

    /**
     * Un dossier vérifié est verrouillé — sauf, TCK-2669, pour la pièce du dirigeant dans la fenêtre
     * de renouvellement, quand `$documentType` la désigne.
     */
    private function assertNotVerified(KycDossier $dossier, ?string $documentType = null): void
    {
        if ($dossier->status !== KycDossierStatus::Verified) {
            return;
        }

        $renewable = $documentType === self::RENEWABLE_DOCUMENT
            && $dossier->expires_at !== null
            && $dossier->expires_at->lte(now()->startOfDay()->addDays(self::RENEWAL_WINDOW_DAYS));
        if (! $renewable) {
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
        if (! $agency) {
            return;
        }

        // TCK-1763 (P161.05) — le verdict mène à `/app/agency/kyc`, qui exige `agency.update_kyc`
        // (TCK-1274) : il part aux admins actifs qui la tiennent, et à l'admin principal en repli
        // seulement quand aucun ne la tient. Il partait au seul admin principal, sans jugement.
        $recipients = AdminsDeLAgence::destinataires((int) $agency->id)
            ->filter(fn (User $admin): bool => $admin->canActAt(Capability::AgencyUpdateKyc, $agency))
            ->values();
        if ($recipients->isEmpty() && $agency->primaryAdmin) {
            $recipients = collect([$agency->primaryAdmin]);
        }

        // TCK-588 — le verdict obéit à `kyc_status_changed` (critique : in-app et e-mail
        // toujours), et non plus à « Alerte seuil KPI » par le type `system`.
        foreach ($recipients as $admin) {
            $this->notifications->send(
                $admin,
                $verified ? NotificationCode::KycVerified : NotificationCode::KycRejected,
                $verified ? [] : ['reason' => $dossier->rejection_reason],
                NotificationTarget::of('agency_kyc')->forAgency($agency->id),
            );
        }
    }
}
