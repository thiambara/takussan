<?php

namespace Tests\Feature\Audit;

use App\Http\Controllers\Api\ActivityLogExportController;
use App\Jobs\Audit\ExportActivityLogJob;
use App\Jobs\Audit\PurgeExpiredActivityLogExports;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Services\Audit\ActivityLogExporter;
use App\Support\LienFront;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\ApiTestCase;
use Tests\Support\OperateursPlateforme;

/**
 * TCK-613 (AC4, ADR-0044 §2) — rejeu de la sonde P4 de verif-601 : le lien de l'export du journal
 * d'audit (e-mails de tous les acteurs) n'est plus un droit au porteur. Sans session → 401 ; par un
 * autre super-admin ou un bailleur → 403 ; par le demandeur → 200 et une ligne `activity_log` ; après
 * l'expiration, le fichier n'est plus sur le disque (TCK-1143, gardé en non-régression).
 */
class ActivityLogExportDownloadTest extends ApiTestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private function adminDAgence(Agency $agency): User
    {
        $user = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        return $user;
    }

    /** Le chemin signé que le BFF du front relaie, tiré du lien du courriel. */
    private function cheminDuCourriel(User $demandeur, Agency $agency): string
    {
        Notification::fake();
        $this->app->instance('request', Request::create('/'));
        activity()->performedOn(Property::factory()->create(['agency_id' => $agency->id]))->causedBy($demandeur)->event('updated')->log('temoin-613');
        (new ExportActivityLogJob($demandeur, ['format' => 'csv'], $agency->id))->handle(app(ActivityLogExporter::class));

        $lien = null;
        Notification::assertSentTo($demandeur, ActivityLogExportReadyNotification::class, function ($n) use (&$lien) {
            $lien = $n->downloadUrl;

            return true;
        });
        // Le bouton du courriel mène au front, pas à l'hôte de l'API.
        $this->assertStringStartsWith(LienFront::base().'/api/activity-logs/export/download?', $lien);

        return substr($lien, strlen(LienFront::base()));
    }

    private function telechargements(User $user): int
    {
        return Activity::query()->where('log_name', 'export')->where('event', 'audit_export_downloaded')
            ->where('causer_type', $user->getMorphClass())->where('causer_id', $user->id)->count();
    }

    public function test_le_lien_de_l_export_d_agence_n_est_servi_qu_a_son_demandeur_connecte(): void
    {
        Storage::fake();
        $agency = Agency::factory()->create();
        $demandeur = $this->adminDAgence($agency);
        $chemin = $this->cheminDuCourriel($demandeur, $agency);

        // Sans session : 401, même avec une signature valide.
        $this->getJson($chemin)->assertUnauthorized();

        // Un autre super-admin, qui ouvre pourtant la console : 403.
        $autreOperateur = $this->operateur(PlatformProfileLevel::SuperAdmin);
        $this->actingAs($autreOperateur, 'sanctum');
        $this->getJson($chemin)->assertForbidden();

        // Un bailleur : 403.
        $bailleur = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $bailleur->id, 'agency_id' => $agency->id]);
        $this->actingAs($bailleur, 'sanctum');
        $this->getJson($chemin)->assertForbidden();

        $this->assertSame(0, $this->telechargements($autreOperateur) + $this->telechargements($bailleur));

        // Le demandeur : 200, et le téléchargement est journalisé — sans le contenu.
        $this->actingAs($demandeur, 'sanctum');
        $contenu = $this->get($chemin)->assertOk()->streamedContent();
        $this->assertStringContainsString('temoin-613', $contenu);
        $this->assertSame(1, $this->telechargements($demandeur));
        $ligne = Activity::query()->where('event', 'audit_export_downloaded')->sole();
        $this->assertStringNotContainsString('temoin-613', (string) json_encode($ligne->properties));

        // Le chemin altéré : la signature ne tient plus.
        $this->getJson(str_replace('file=', 'file=0', $chemin))->assertForbidden();
    }

    public function test_le_fichier_de_la_console_n_est_servi_qu_a_l_operateur_qui_l_a_demande(): void
    {
        Storage::fake();
        activity('Property')->performedOn(Agency::factory()->create())->event('updated')->log('temoin-console-613');
        $demandeur = $this->apiActingAsRole('super_admin');

        $chemin = (string) $this->apiGet('/api/admin/audit/export')->assertOk()->json('data.url');
        // Un chemin signé RELATIF de la console, que l'écran relaie par `/api/super-admin/*`.
        $this->assertStringStartsWith('/api/admin/audit/export/download?', $chemin);

        $this->assertStringContainsString('temoin-console-613', $this->get($chemin)->assertOk()->streamedContent());
        $this->assertSame(1, $this->telechargements($demandeur));

        // Un autre super-admin : il lit l'audit de la console, mais pas le fichier d'un autre.
        $autre = $this->apiActingAsRole('super_admin');
        $this->assertNotSame($demandeur->id, $autre->id);
        $this->apiGet('/api/admin/audit')->assertOk();
        $this->getJson($chemin)->assertForbidden();
    }

    public function test_le_fichier_expire_est_purge(): void
    {
        Storage::fake();
        $agency = Agency::factory()->create();
        $demandeur = $this->adminDAgence($agency);
        $chemin = $this->cheminDuCourriel($demandeur, $agency);
        $fichiers = Storage::disk(ActivityLogExportController::DISK)->allFiles(ActivityLogExportController::STORAGE_ROOT);
        $this->assertCount(1, $fichiers);
        touch(Storage::disk(ActivityLogExportController::DISK)->path($fichiers[0]), now()->subHours(ActivityLogExportController::LINK_TTL_HOURS + 1)->getTimestamp());

        (new PurgeExpiredActivityLogExports)->handle();

        $this->assertFalse(Storage::disk(ActivityLogExportController::DISK)->exists($fichiers[0]));
        $this->actingAs($demandeur, 'sanctum');
        $this->getJson($chemin)->assertNotFound();
    }
}
