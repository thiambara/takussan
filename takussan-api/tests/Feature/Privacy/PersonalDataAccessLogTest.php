<?php

namespace Tests\Feature\Privacy;

use App\Models\Activity;
use App\Models\Agency;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\User;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\ApiTestCase;
use Tests\Support\RemoteDiskFake;

/**
 * TCK-601 (AC16, ADR-0044 §4) — chaque consultation de données personnelles depuis la console
 * laisse UNE trace `personal_data_viewed` par (lecteur, sujet, surface) et par fenêtre de 15 min.
 */
class PersonalDataAccessLogTest extends ApiTestCase
{
    use RefreshDatabase;

    private function traces(string $surface): int
    {
        return Activity::query()
            ->where('log_name', PersonalDataAccessLogger::LOG_NAME)
            ->where('event', PersonalDataAccessLogger::EVENT)
            ->where('properties->surface', $surface)
            ->count();
    }

    private function dossier(Agency $agency): KycDossier
    {
        return KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Submitted,
            'submitted_at' => now(),
        ]);
    }

    public function test_le_detail_les_sessions_et_l_activite_d_un_utilisateur_sont_traces_une_fois(): void
    {
        $admin = $this->apiActingAsRole('super_admin');
        $user = User::factory()->create();

        foreach (['' => PersonalDataAccessLogger::SURFACE_USER_DETAIL, '/sessions' => PersonalDataAccessLogger::SURFACE_USER_SESSIONS, '/activity' => PersonalDataAccessLogger::SURFACE_USER_ACTIVITY] as $suffix => $surface) {
            $this->apiGet("/api/admin/users/{$user->id}{$suffix}")->assertOk();
            $this->apiGet("/api/admin/users/{$user->id}{$suffix}")->assertOk();
            $this->assertSame(1, $this->traces($surface), $surface);
        }

        $trace = Activity::query()->where('log_name', PersonalDataAccessLogger::LOG_NAME)->firstOrFail();
        $this->assertSame($admin->id, (int) $trace->causer_id);
        $this->assertSame($user->getMorphClass(), $trace->subject_type);
        $this->assertSame($user->id, (int) $trace->subject_id);

        // Passé la fenêtre, une nouvelle ouverture est une nouvelle consultation.
        $this->travel(PersonalDataAccessLogger::WINDOW_MINUTES + 1)->minutes();
        $this->apiGet("/api/admin/users/{$user->id}")->assertOk();
        $this->assertSame(2, $this->traces(PersonalDataAccessLogger::SURFACE_USER_DETAIL));
    }

    public function test_un_dossier_et_une_piece_kyc_ouverts_depuis_la_console_sont_traces(): void
    {
        Storage::fake('public');
        RemoteDiskFake::install('r2-private');
        $agency = Agency::factory()->create();
        $dossier = $this->dossier($agency);
        $media = $dossier->addMedia(UploadedFile::fake()->createWithContent('cni.pdf', 'piece'))->toMediaCollection('documents');

        $this->apiActingAsRole('super_admin');
        $this->apiGet("/api/admin/kyc/{$dossier->id}")->assertOk();
        $this->apiGet("/api/admin/kyc/{$dossier->id}")->assertOk();
        $this->assertSame(1, $this->traces(PersonalDataAccessLogger::SURFACE_KYC_DOSSIER));

        // Le dossier d'une agence ouvert par sa fiche : même surface, nouvelle trace hors fenêtre.
        $this->travel(PersonalDataAccessLogger::WINDOW_MINUTES + 1)->minutes();
        $this->apiGet("/api/admin/agencies/{$agency->id}/kyc")->assertOk();
        $this->assertSame(2, $this->traces(PersonalDataAccessLogger::SURFACE_KYC_DOSSIER));

        $url = URL::temporarySignedRoute('kyc.documents.show', now()->addMinutes(15), ['media' => $media->id]);
        $this->get($url)->assertOk();
        $this->get($url)->assertOk();
        $this->assertSame(1, $this->traces(PersonalDataAccessLogger::SURFACE_KYC_DOCUMENT));

        // La trace d'une pièce appartient à l'agence du dossier (ADR-0044 §3).
        $this->assertSame($agency->id, Activity::query()->where('properties->surface', PersonalDataAccessLogger::SURFACE_KYC_DOCUMENT)->value('agency_id'));
    }

    /** Second chemin — un refus n'est pas une consultation : la pièce refusée ne laisse aucune trace. */
    public function test_une_piece_refusee_ne_laisse_aucune_trace(): void
    {
        Storage::fake('public');
        RemoteDiskFake::install('r2-private');
        $media = $this->dossier(Agency::factory()->create())
            ->addMedia(UploadedFile::fake()->createWithContent('cni.pdf', 'piece'))->toMediaCollection('documents');

        $this->apiActingAsRole('agency_admin', ['agency' => Agency::factory()->create()]);
        $this->get(URL::temporarySignedRoute('kyc.documents.show', now()->addMinutes(15), ['media' => $media->id]))->assertForbidden();

        $this->assertSame(0, $this->traces(PersonalDataAccessLogger::SURFACE_KYC_DOCUMENT));
    }
}
