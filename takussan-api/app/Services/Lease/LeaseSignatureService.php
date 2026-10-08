<?php

namespace App\Services\Lease;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Model\LeaseService;
use App\Services\Model\NotificationService;
use App\Services\Pdf\DocumentPdfService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * TCK-596 §4B (ADR-0042) — la signature d'un bail.
 *
 *  · {@see Request()}   fige le contrat (PDF rendu une fois, privé, haché) et passe le bail
 *                       `pending_signature` ;
 *  · {@see sendCode()}  envoie à un signataire le code qui vaut signature de CETTE empreinte ;
 *  · {@see sign()}      vérifie le code, enregistre la preuve, et active le bail à la seconde
 *                       signature, dans la même transaction, une seule fois ;
 *  · {@see signOnPaper()} la voie hors plateforme : contrat numérisé, preuve `paper` par partie.
 *
 * ⚠ La policy ne suffit pas : `Gate::before` accorde tout au super-admin. Le signataire est donc
 * revérifié ici ({@see assertSigner()}), sans voie propre au super-admin.
 */
class LeaseSignatureService
{
    public function __construct(
        private readonly DocumentPdfService $pdf,
        private readonly LeaseSignatureOtpService $otp,
        private readonly NotificationService $notifications,
        private readonly LeaseService $leases,
    ) {}

    public function request(Lease $lease, User $by): Lease
    {
        abort_code_unless(
            in_array($lease->status, [LeaseStatus::Draft, LeaseStatus::PendingSignature], true),
            422,
            'lease_signature.not_requestable'
        );

        $lease->loadMissing(['property.address', 'tenant.user', 'landlord', 'agency', 'guarantors']);
        // ADR-0042 §5 — la v1 exige un compte au locataire ; sinon, la voie papier.
        abort_code_if($lease->tenant?->user_id === null, 422, 'lease_signature.tenant_without_account');

        // VERIF-596 passe 2 (N1) — les termes exécutés hors colonne sont figés AVANT le rendu : le
        // PDF imprime exactement ce que le bail enregistre, et exécutera.
        // Sur une copie : le modèle de l'appelant ne garde pas d'attributs sales.
        $terms = $this->executionTerms($lease);
        $printed = (clone $lease)->forceFill($terms);

        $bytes = $this->pdf->render('pdf.leases.contract', [
            'title' => 'Contrat de bail '.($lease->reference_number ?? $lease->id),
            'document_label' => 'Bail',
            'lease' => $printed,
            'tenant' => $lease->tenant,
            'landlord' => $lease->landlord,
            'property' => $lease->property,
            'agency' => $lease->agency,
            'guarantors' => $lease->guarantors,
        ]);
        $sha = hash('sha256', $bytes);

        $fresh = DB::transaction(function () use ($lease, $bytes, $sha, $terms): Lease {
            /** @var Lease $locked */
            $locked = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless(
                in_array($locked->status, [LeaseStatus::Draft, LeaseStatus::PendingSignature], true),
                422,
                'lease_signature.not_requestable'
            );

            $locked->addMediaFromString($bytes)
                ->usingFileName(sprintf('bail-%s.pdf', $locked->reference_number ?? $locked->id))
                ->toMediaCollection('signed_contract');

            $locked->forceFill($terms + [
                'status' => LeaseStatus::PendingSignature,
                'contract_sha256' => $sha,
                'signature_requested_at' => now(),
            ])->save();

            return $locked->refresh();
        });

        foreach ($this->parties($fresh) as $user) {
            $this->notify($user, NotificationCode::LeaseSignatureRequested, $fresh);
        }

        return $fresh;
    }

    /**
     * @return array{channel: string, destination: string}
     */
    public function sendCode(Lease $lease, User $user, string $role): array
    {
        $this->assertSigner($lease, $user, $role);
        $this->assertAwaiting($lease, $role);

        abort_code_if($this->otp->isLocked($lease, $user, $role), 423, 'lease_signature.code_locked');
        abort_code_unless($this->otp->canResend($lease, $user, $role), 429, 'lease_signature.resend_too_soon');

        $sms = is_string($user->phone) && $user->phone !== '' && $user->phone_verified_at !== null;
        $channel = $sms ? LeaseSignatureCodeNotification::CHANNEL_SMS : LeaseSignatureCodeNotification::CHANNEL_MAIL;
        $destination = $sms ? self::maskPhone((string) $user->phone) : self::maskEmail((string) $user->email);

        $code = $this->otp->issue($lease, $user, $role, $channel, $destination);
        $user->notify(new LeaseSignatureCodeNotification(
            $code,
            (string) ($lease->reference_number ?? $lease->id),
            (int) (LeaseSignatureOtpService::CODE_TTL_SECONDS / 60),
            $channel,
        ));

        return ['channel' => $channel, 'destination' => $destination];
    }

    public function sign(Lease $lease, User $user, string $role, string $code, Request $request): Lease
    {
        $this->assertSigner($lease, $user, $role);

        [$fresh, $activated] = DB::transaction(function () use ($lease, $user, $role, $code, $request): array {
            /** @var Lease $locked */
            $locked = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            $this->assertAwaiting($locked, $role);
            abort_code_if($this->otp->isLocked($locked, $user, $role), 423, 'lease_signature.code_locked');

            $proof = $this->otp->attempt($locked, $user, $role, $code);
            // Le faux qui pose le verrou le dit tout de suite.
            abort_code_if($proof === null && $this->otp->isLocked($locked, $user, $role), 423, 'lease_signature.code_locked');
            abort_code_if($proof === null, 422, 'lease_signature.invalid_code');

            LeaseSignature::query()->create([
                'lease_id' => $locked->id,
                'role' => $role,
                'method' => LeaseSignature::METHOD_OTP,
                'user_id' => $user->id,
                'on_behalf_of_user_id' => $role === LeaseSignature::ROLE_LANDLORD ? LandlordSignatory::onBehalfOf($user, $locked) : null,
                'document_sha256' => $locked->contract_sha256,
                'signed_at' => now(),
                'ip_address' => $request->ip(),
                'user_agent' => mb_substr((string) $request->userAgent(), 0, 512),
                'otp_channel' => $proof['channel'],
                'otp_destination' => $proof['destination'],
            ]);

            $other = $role === LeaseSignature::ROLE_TENANT ? LeaseSignature::ROLE_LANDLORD : LeaseSignature::ROLE_TENANT;
            $complete = $locked->signatures()
                ->where('document_sha256', $locked->contract_sha256)
                ->where('role', $other)
                ->exists();

            // ADR-0042 §8 — sous le verrou de la ligne, le statut vient d'être relu : une seule
            // activation, quel que soit l'ordre ou la concurrence des deux signatures.
            return [$complete ? $this->leases->completeActivation($locked) : $locked->refresh(), $complete];
        });

        if ($activated) {
            foreach ($this->parties($fresh) as $party) {
                $this->notify($party, NotificationCode::LeaseSignatureCompleted, $fresh);
            }
        } else {
            // Toute partie sauf le signataire — le bailleur compris quand le personnel a signé pour
            // son compte : il apprend qu'on l'a engagé.
            foreach ($this->parties($fresh) as $party) {
                if ($party->id !== $user->id) {
                    $this->notify($party, NotificationCode::LeaseSignedByParty, $fresh, ['signer' => $user->getFullNameAttribute()]);
                }
            }
        }

        return $fresh;
    }

    /**
     * ADR-0042 §6 — la voie hors plateforme : le contrat signé sur papier, numérisé, fait foi. Une
     * preuve `paper` par partie, avec l'auteur de l'enregistrement. Accepte `draft` et
     * `pending_signature` (fin de l'impasse du renouvellement).
     */
    public function signOnPaper(Lease $lease, UploadedFile $contract, User $by): Lease
    {
        // VERIF-596 M1 — revérifié ici comme pour la voie par code : la preuve `paper` du bailleur
        // n'est enregistrée que par qui peut signer pour lui (super-admin exclu, `Gate::before`).
        abort_unless(LandlordSignatory::allows($by, $lease), 403);

        $sha = hash_file('sha256', $contract->getRealPath());

        return DB::transaction(function () use ($lease, $contract, $sha, $by): Lease {
            /** @var Lease $locked */
            $locked = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            abort_code_unless(
                in_array($locked->status, [LeaseStatus::Draft, LeaseStatus::PendingSignature], true),
                422,
                'lease.not_activatable'
            );

            $locked->addMedia($contract)->toMediaCollection('signed_contract');
            $locked->forceFill($this->executionTerms($locked) + ['contract_sha256' => $sha])->save();

            foreach (LeaseSignature::ROLES as $role) {
                LeaseSignature::query()->firstOrCreate(
                    ['lease_id' => $locked->id, 'role' => $role, 'document_sha256' => $sha],
                    ['method' => LeaseSignature::METHOD_PAPER, 'recorded_by_id' => $by->id, 'signed_at' => now()],
                );
            }

            return $this->leases->completeActivation($locked);
        });
    }

    /** Le signataire, revérifié ici — super-admin compris (`Gate::before`). */
    public function assertSigner(Lease $lease, User $user, string $role): void
    {
        $allowed = match ($role) {
            LeaseSignature::ROLE_TENANT => ($tenantUserId = $lease->tenant()->value('user_id')) !== null && (int) $tenantUserId === (int) $user->id,
            LeaseSignature::ROLE_LANDLORD => LandlordSignatory::allows($user, $lease),
            default => false,
        };

        abort_unless($allowed, 403);
    }

    /** Les rôles pour lesquels `$user` peut signer ce bail, pour l'écran. @return list<string> */
    public static function rolesFor(User $user, Lease $lease): array
    {
        $roles = [];
        if ($lease->tenant?->user_id !== null && (int) $lease->tenant->user_id === (int) $user->id) {
            $roles[] = LeaseSignature::ROLE_TENANT;
        }
        if (LandlordSignatory::allows($user, $lease)) {
            $roles[] = LeaseSignature::ROLE_LANDLORD;
        }

        return $roles;
    }

    /**
     * VERIF-596 passe 2 (N1, ADR-0042 §1) — l'indemnité de départ anticipé et le plafond de révision
     * que le contrat imprime, figés sur le bail : la valeur négociée sur le bail si elle existe,
     * sinon le réglage global AU MOMENT où le contrat est figé. `late_fees.cap_percent` ne l'est
     * pas : il ne peut que baisser la pénalité imprimée.
     *
     * @return array{early_termination_penalty_months: int, rent_review_max_pct: float}
     */
    private function executionTerms(Lease $lease): array
    {
        return [
            'early_termination_penalty_months' => app(EarlyTerminationService::class)->penaltyMonthsFor($lease),
            'rent_review_max_pct' => app(RentReviewService::class)->maxPctFor($lease),
        ];
    }

    private function assertAwaiting(Lease $lease, string $role): void
    {
        abort_code_unless(
            $lease->status === LeaseStatus::PendingSignature && $lease->contract_sha256 !== null,
            409,
            'lease_signature.not_requested'
        );
        // ADR-0042 §1 — on ne signe pas une empreinte sans document : le contrat figé doit exister et
        // avoir encore cette empreinte (fermé à l'échec, comme le téléchargement).
        abort_code_if($lease->frozenContractBytes() === null, 409, 'lease_signature.contract_missing');
        abort_code_if(
            $lease->signatures()->where('document_sha256', $lease->contract_sha256)->where('role', $role)->exists(),
            409,
            'lease_signature.already_signed'
        );
    }

    /** Les parties qui ont un compte : l'utilisateur du locataire, et le bailleur. @return list<User> */
    private function parties(Lease $lease): array
    {
        $lease->loadMissing(['tenant.user', 'landlord']);

        return collect([$lease->tenant?->user, $lease->landlord])
            ->filter()
            ->unique('id')
            ->values()
            ->all();
    }

    /** @param  array<string, string>  $extra */
    private function notify(User $user, NotificationCode $code, Lease $lease, array $extra = []): void
    {
        $lease->loadMissing('property');
        $this->notifications->send($user, $code, [
            'reference' => (string) ($lease->reference_number ?? $lease->id),
            'property' => (string) ($lease->property?->title ?? ''),
        ] + $extra, NotificationTarget::of('lease', $lease->id));
    }

    public static function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        return strlen($digits) <= 2 ? '••' : str_repeat('•', max(strlen($digits) - 2, 0)).substr($digits, -2);
    }

    public static function maskEmail(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');

        return mb_substr($local, 0, 1).'•••@'.$domain;
    }
}
