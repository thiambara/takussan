<?php

namespace Tests\Feature\Seeders;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Invitation\InvitationService;
use Database\Seeders\Demo\PersonasDeFideliteSeeder as Personas;
use Database\Seeders\Demo\RetirerPersonasDeFideliteSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2798 — les personas de fidélité : un seeder idempotent, repérable et réversible, dont chaque état est éprouvé
 * par la vraie route qu'il sert.
 */
class PersonasDeFideliteSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_semer_deux_fois_ne_cree_rien_de_plus_et_retirer_rend_la_base_d_avant(): void
    {
        Mail::fake();
        Notification::fake();
        // Des témoins que le retrait ne doit pas toucher : un domaine qui ne fait que COMMENCER comme celui des
        // personas, une agence de la démo avec son bien.
        $temoin = User::factory()->create(['email' => 'temoin@personas.takussan.test.example']);
        $agenceDeLaDemo = Agency::factory()->create();
        $bienDeLaDemo = Property::factory()->create(['agency_id' => $agenceDeLaDemo->id, 'user_id' => $temoin->id]);

        $avant = $this->comptes();
        $this->seed(Personas::class);
        $apres1 = $this->comptes();
        $ids1 = $this->comptesDesPersonas();

        $this->seed(Personas::class);
        $this->assertSame($apres1, $this->comptes(), 'une deuxième exécution a créé ou supprimé des lignes');
        $this->assertSame($ids1, $this->comptesDesPersonas(), 'une deuxième exécution a changé les comptes');
        // Le gérant, le prestataire de l'intervention, les deux comptes neufs et l'hôte ; les invités n'ont pas de compte.
        $this->assertCount(5, $ids1);
        $this->assertNotSame($avant, $apres1);
        // Le journal ne compte que les témoins : le semeur n'y écrit rien.
        $this->assertSame($avant['activity_log'], $apres1['activity_log'], 'le semeur a écrit au journal');

        $this->seed(RetirerPersonasDeFideliteSeeder::class);
        $this->assertSame($avant, $this->comptes(), 'le retrait laisse des lignes, ou en a pris à la démo');
        $this->assertSame(0, User::withTrashed()->where('email', 'like', '%@'.Personas::DOMAINE)->count());
        $this->assertSame(0, Agency::withTrashed()->where('slug', 'like', 'personas-%')->count());
        $this->assertNotNull($temoin->fresh());
        $this->assertNotNull($bienDeLaDemo->fresh());

        Mail::assertNothingSent();
        Mail::assertNothingQueued();
        Notification::assertNothingSent();
    }

    public function test_le_retrait_emporte_ce_que_les_gestes_y_ont_accroche(): void
    {
        $this->seed(Personas::class);
        $prestataire = User::query()->where('email', Personas::PRESTATAIRE_INTERVENTION)->firstOrFail();
        $prestataire->createToken('fidelite-pixel');
        activity('Test')->causedBy($prestataire)->log('geste');

        $this->seed(RetirerPersonasDeFideliteSeeder::class);

        $this->assertSame(0, DB::table('personal_access_tokens')->count());
        $this->assertSame(0, DB::table('activity_log')->count());
        $this->assertSame(0, DB::table('notification_preferences')->where('user_id', $prestataire->id)->count());
    }

    public function test_le_prestataire_de_l_intervention_lit_sa_demande_par_la_vraie_route(): void
    {
        $this->seed(Personas::class);
        $prestataire = User::query()->where('email', Personas::PRESTATAIRE_INTERVENTION)->firstOrFail();
        $sp = ServiceProviderProfile::query()->where('user_id', $prestataire->id)->firstOrFail();
        $demande = MaintenanceRequest::query()->where('title', Personas::DEMANDE)->firstOrFail();

        $this->assertNotNull($prestataire->phone_verified_at);
        $this->assertSame(1, $sp->agencyCollaborations()->count());

        Sanctum::actingAs($prestataire);
        $url = "/api/me/profiles/{$sp->id}/intervention-d-origine";
        $this->getJson($url)->assertOk()
            ->assertJsonPath('data.id', $demande->id)
            ->assertJsonPath('data.title', Personas::DEMANDE)
            ->assertJsonPath('data.place', ['quarter' => 'Mermoz', 'city' => 'Dakar']);

        // Un relevé a fini l'onboarding : le lien est consommé, la demande assignée. La route ne rend plus rien…
        $invitation = Invitation::query()->where('email', Personas::PRESTATAIRE_INTERVENTION)->firstOrFail();
        $invitation->forceFill(['metadata' => [...$invitation->metadata, 'deep_link_consumed_at' => now()->toIso8601String()]])->save();
        $demande->forceFill(['assigned_to' => $prestataire->id, 'status' => MaintenanceStatus::Acknowledged])->save();
        $this->getJson($url)->assertOk()->assertExactJson(['data' => null]);

        // … et une nouvelle exécution remet l'écran, sans créer de ligne.
        $this->seed(Personas::class);
        $this->getJson($url)->assertOk()->assertJsonPath('data.id', $demande->id);
        $this->assertSame(1, MaintenanceRequest::query()->where('title', Personas::DEMANDE)->count());
    }

    public function test_les_invites_ont_un_profil_brouillon_et_une_invitation_utilisable_qu_aucun_rappel_ne_touche(): void
    {
        Mail::fake();
        Notification::fake();
        $this->seed(Personas::class);

        foreach ([
            Personas::BAILLEUR_INVITE => OwnerProfile::class,
            Personas::AGENT_INVITE => AgentProfile::class,
            Personas::PRESTATAIRE_INVITE => ServiceProviderProfile::class,
        ] as $email => $classe) {
            $invitation = Invitation::query()->where('email', $email)->sole();
            $this->assertSame(InvitationStatus::Sent, $invitation->status);
            $this->assertNull(User::query()->where('email', $email)->first(), "{$email} ne doit pas avoir de compte");

            $profil = $invitation->invitable;
            $this->assertInstanceOf($classe, $profil);
            $this->assertNull($profil->user_id);
            $this->assertSame('draft', $profil->status->value);

            // L'écran public de l'invitation la sert.
            $this->getJson("/api/public/invitations/{$invitation->token}")->assertOk();
            $this->assertSame($invitation->id, app(InvitationService::class)->lookupActiveInvitation($invitation->token)->id);
        }

        // Le planificateur ne les relance ni ne les expire.
        $this->travel(6)->days();
        $this->assertCount(0, app(InvitationService::class)->remindPending());
        $this->assertCount(0, app(InvitationService::class)->expire());
        Mail::assertNothingSent();
        Mail::assertNothingQueued();
        Notification::assertNothingSent();
    }

    public function test_les_comptes_neufs_ont_un_numero_verifie_sans_intention_ni_profil(): void
    {
        $this->seed(Personas::class);

        $awa = User::query()->where('email', Personas::ORIENTATION_AVEC_PRENOM)->firstOrFail();
        $sansPrenom = User::query()->where('email', Personas::ORIENTATION_SANS_PRENOM)->firstOrFail();
        $this->assertSame('Awa', $awa->first_name);
        $this->assertSame('', $sansPrenom->first_name);

        foreach ([$awa, $sansPrenom] as $compte) {
            $this->assertNotNull($compte->phone_verified_at);
            // Aucun profil : le seul type est celui de tout compte.
            $this->assertSame(['customer'], $compte->profileTypes()->all());
            $this->assertNull($compte->preferences);
        }

        // Une réponse donnée pendant un relevé est effacée par l'exécution suivante.
        $awa->forceFill(['preferences' => ['entry_intent' => 'publish']])->save();
        $this->seed(Personas::class);
        $this->assertNull($awa->fresh()->preferences);
    }

    public function test_l_hote_est_le_bailleur_de_ses_biens(): void
    {
        $this->seed(Personas::class);
        $hote = User::query()->where('email', Personas::HOTE)->firstOrFail();
        $espace = Agency::query()->where('slug', Personas::ESPACE_HOTE)->firstOrFail();

        $this->assertSame('individual', $espace->kind->value);
        $this->assertSame([$hote->id], OwnerProfile::query()->where('agency_id', $espace->id)->pluck('user_id')->all());

        Sanctum::actingAs($hote);
        $this->getJson('/api/dashboard/me')->assertOk()
            ->assertJsonPath('data.role', 'owner')
            ->assertJsonPath('data.metrics.portfolio_total', count(Personas::BIENS_DE_L_HOTE));
    }

    /** @return array<string, int> le nombre de lignes de chaque table */
    private function comptes(): array
    {
        $tables = collect(DB::select('select tablename from pg_tables where schemaname = current_schema() order by tablename'))
            ->pluck('tablename');

        return $tables->mapWithKeys(fn (string $t) => [$t => (int) DB::table($t)->count()])->all();
    }

    /** @return list<int> */
    private function comptesDesPersonas(): array
    {
        return User::withTrashed()->where('email', 'like', '%@'.Personas::DOMAINE)->orderBy('id')->pluck('id')->all();
    }
}
