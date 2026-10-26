<?php

namespace Database\Seeders\Core;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\User;
use App\Services\Kyc\KycWorkflowService;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\SeedPdf;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — le dossier KYC qui a fait vérifier chaque agence `standard` : ouvert, ses trois pièces
 * déposées, soumis par le titulaire, vérifié par la plateforme le jour où l'agence l'a été
 * (`agencies.verified_at`, posé par AgencySeeder).
 *
 * L'ouverture passe par le service (`dossierForAgency`). La soumission et la vérification sont
 * écrites dans la forme du service, journal d'activité compris, sans ses avis : ils partent par SMS
 * aux super-admins et au titulaire, et le seed ne fait aucun appel sortant.
 */
class KycDossierSeeder extends Seeder
{
    public function __construct(
        private readonly SeedingContext $ctx,
        private readonly KycWorkflowService $kyc,
    ) {}

    public function run(): void
    {
        $operateur = $this->ctx->operateur();

        foreach ($this->ctx->agencies as $agency) {
            $titulaire = $agency->primary_admin_id !== null ? User::query()->find($agency->primary_admin_id) : null;
            if ($agency->kind !== AgencyKind::Standard || $titulaire === null || $agency->verified_at === null) {
                continue;
            }

            $verifieLe = CarbonImmutable::parse($agency->verified_at);
            $soumisLe = Timeline::businessHour($verifieLe->subDays(mt_rand(2, 6)));
            $ouvertLe = Timeline::businessHour($soumisLe->subDays(mt_rand(1, 8)));

            $dossier = Timeline::aLaDate($ouvertLe, fn () => $this->kyc->dossierForAgency($agency));
            Timeline::aLaDate($ouvertLe->addHours(mt_rand(1, 20)), fn () => $this->deposerLesPieces($dossier, $agency));

            Timeline::aLaDate($soumisLe, function () use ($dossier, $titulaire): void {
                $dossier->update(['status' => KycDossierStatus::Submitted, 'submitted_at' => now(), 'rejection_reason' => null]);
                activity('KYC')->causedBy($titulaire)->performedOn($dossier)->event('kyc_submitted')->log('Dossier KYC soumis');
            });

            Timeline::aLaDate($verifieLe, function () use ($dossier, $operateur): void {
                $dossier->update([
                    'status' => KycDossierStatus::Verified,
                    'reviewed_at' => now(),
                    'reviewed_by' => $operateur->id,
                    'rejection_reason' => null,
                    // L'échéance que le service calcule : la plus proche des pièces les plus récentes.
                    'expires_at' => $this->kyc->expiryOf($dossier->refresh()),
                    'metadata' => [],
                ]);
                activity('KYC')->causedBy($operateur)->performedOn($dossier)->event('kyc_verified')->log('Dossier KYC vérifié');
            });
        }
    }

    /** Les pièces exigées (`AGENCY_REQUIRED_DOCUMENTS`), nommées et décrites comme `upload()` les range. */
    private function deposerLesPieces(KycDossier $dossier, Agency $agency): void
    {
        // Une carte d'identité sénégalaise vaut dix ans : elle expire entre trois mois et six ans
        // après aujourd'hui, jamais avant (la tâche d'échéance repasserait le dossier en `pending`).
        $finDeLaPiece = CarbonImmutable::today()->addDays(mt_rand(90, 6 * 365))->toDateString();
        $pieces = [
            'rccm' => ['Registre du commerce et du crédit mobilier', ['Dénomination : '.$agency->name, 'N° RCCM : SN-DKR-'.mt_rand(2010, 2024).'-B-'.mt_rand(1000, 99999)], null],
            'ninea' => ['Numéro d\'identification national (NINEA)', ['Raison sociale : '.$agency->name, 'NINEA : '.sprintf('%09d', mt_rand(0, 999_999_999))], null],
            'director_id' => ['Carte nationale d\'identité CEDEAO', ['Titulaire : gérant de '.$agency->name, 'Valable jusqu\'au '.$finDeLaPiece], $finDeLaPiece],
        ];

        foreach ($pieces as $type => [$titre, $lignes, $expire]) {
            $dossier->addMediaFromString(SeedPdf::page($titre, $lignes))
                ->usingFileName(str()->slug($type).'.pdf')
                ->withCustomProperties(array_filter(['document_type' => $type, 'expires_at' => $expire]))
                ->toMediaCollection('documents');
        }
    }
}
