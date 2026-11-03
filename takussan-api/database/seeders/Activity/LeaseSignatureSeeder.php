<?php

namespace Database\Seeders\Activity;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\LeaseSignature;
use App\Models\User;
use App\Notifications\LeaseSignatureCodeNotification;
use App\Services\Lease\LeaseSignatureService;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — la preuve de signature de chaque bail signé (ADR-0042) : son contrat FIGÉ, puis la
 * signature de ses deux parties sur l'empreinte de ce contrat.
 *
 *  - Le contrat se fige par le rendu de l'application (`freezeRenewal` : PDF rangé dans
 *    `signed_contract`, `contract_sha256`, termes d'exécution) — sans document, une signature ne
 *    porte sur rien, et le téléchargement du bail refuserait (`lease_signature.contract_missing`).
 *  - Un locataire qui a un compte signe par code (`otp`), le bailleur aussi, ou son agent pour lui
 *    (`on_behalf_of_user_id`) ; sans compte, la voie papier (`paper`), enregistrée par l'agent.
 *  - Un renouvellement né `active` ne se signe pas : son contrat se fige seul, comme dans
 *    `LeaseRenewalService`. Un brouillon n'a rien.
 *
 * Les lignes sont écrites dans la forme de `LeaseSignatureService::sign()` / `signOnPaper()` : la
 * voie par code exige une requête HTTP et un code émis par SMS, que le seed ne fait pas.
 */
class LeaseSignatureSeeder extends Seeder
{
    private const NAVIGATEURS = [
        'Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
        'Mozilla/5.0 (Linux; Android 12; TECNO KI5k) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
    ];

    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly LeaseSignatureService $signatures,
    ) {}

    public function run(): void
    {
        if (! $this->ctx->config->contratsFiges) {
            return;
        }

        foreach ($this->ctx->leases->sortBy('id') as $lease) {
            if ($lease->status === LeaseStatus::Draft || $lease->signed_at === null) {
                continue;
            }
            $signeLe = CarbonImmutable::parse($lease->signed_at);

            if ($lease->renewed_from_lease_id !== null) {
                Timeline::aLaDate($signeLe, fn () => $this->signatures->freezeRenewal($lease));

                continue;
            }

            $demandeLe = Timeline::businessHour($signeLe->subDays(mt_rand(1, 4)));
            $locataire = Customer::query()->find($lease->tenant_id)?->user_id;
            $locataire = $locataire !== null ? User::query()->find($locataire) : null;

            $locataire !== null
                ? $this->parCode($lease, $locataire, $demandeLe, $signeLe)
                : $this->surPapier($lease, $signeLe);
        }
    }

    private function parCode(Lease $lease, User $locataire, CarbonImmutable $demandeLe, CarbonImmutable $signeLe): void
    {
        Timeline::aLaDate($demandeLe, function () use ($lease): void {
            $this->signatures->freezeRenewal($lease);
            $lease->forceFill(['signature_requested_at' => now()])->save();
        });

        // Le bailleur signe lui-même, ou son agent pour lui (`LandlordSignatory::onBehalfOf`).
        $bailleur = mt_rand(1, 100) <= 65 || $lease->agent_id === null
            ? User::query()->find($lease->landlord_id)
            : User::query()->find($lease->agent_id);
        if ($bailleur !== null) {
            $this->signer($lease, LeaseSignature::ROLE_LANDLORD, $bailleur, $demandeLe->addHours(mt_rand(1, 20)));
        }
        $this->signer($lease, LeaseSignature::ROLE_TENANT, $locataire, $signeLe);
    }

    private function signer(Lease $lease, string $role, User $signataire, CarbonImmutable $le): void
    {
        $sms = is_string($signataire->phone) && $signataire->phone !== '' && $signataire->phone_verified_at !== null;

        Timeline::aLaDate($le, fn () => LeaseSignature::query()->create([
            'lease_id' => $lease->id,
            'role' => $role,
            'method' => LeaseSignature::METHOD_OTP,
            'user_id' => $signataire->id,
            'on_behalf_of_user_id' => $role === LeaseSignature::ROLE_LANDLORD && (int) $signataire->id !== (int) $lease->landlord_id
                ? (int) $lease->landlord_id
                : null,
            'document_sha256' => $lease->contract_sha256,
            'signed_at' => now(),
            'ip_address' => '41.'.mt_rand(82, 83).'.'.mt_rand(0, 255).'.'.mt_rand(1, 254),
            'user_agent' => Tirage::un(self::NAVIGATEURS),
            'otp_channel' => $sms ? LeaseSignatureCodeNotification::CHANNEL_SMS : LeaseSignatureCodeNotification::CHANNEL_MAIL,
            'otp_destination' => $sms
                ? LeaseSignatureService::maskPhone((string) $signataire->phone)
                : LeaseSignatureService::maskEmail((string) $signataire->email),
        ]));
    }

    /** Le contrat signé à l'agence, scanné : la voie papier enregistre les deux parties d'un coup. */
    private function surPapier(Lease $lease, CarbonImmutable $signeLe): void
    {
        Timeline::aLaDate($signeLe, function () use ($lease): void {
            $this->signatures->freezeRenewal($lease);
            foreach (LeaseSignature::ROLES as $role) {
                LeaseSignature::query()->create([
                    'lease_id' => $lease->id,
                    'role' => $role,
                    'method' => LeaseSignature::METHOD_PAPER,
                    'recorded_by_id' => $lease->agent_id ?? $lease->landlord_id,
                    'document_sha256' => $lease->contract_sha256,
                    'signed_at' => now(),
                ]);
            }
        });
    }
}
