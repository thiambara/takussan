<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2613 — `GET /api/me/profiles/{sp}/intervention-d-origine` : la demande jointe à l'invitation, montrée au
 * prestataire invité à l'écran 2 de son assistant, AVANT la fin d'onboarding qui la lui assigne.
 *
 * Conditions de team-lead (2026-11-13) : le titulaire du profil seul, onboarding pas encore fini (lien non consommé —
 * l'acceptation passe déjà le profil à `active`) ; la demande d'origine de
 * l'invitation acceptée, dans la même agence ; des champs minimaux (titre, catégorie, ville ou quartier, photo,
 * devis), jamais l'adresse exacte, le demandeur ni son téléphone ; sparse fieldsets. Les cas de non-fuite :
 * un autre prestataire, le même sur une autre demande, une autre agence, un lien déjà consommé, un profil complété.
 */
class InterventionDOrigineTest extends TestCase
{
    use RefreshDatabase;

    private const RUE = '12 rue Carnot, immeuble Fatou';

    private const TELEPHONE_DU_LOCATAIRE = '+221771112233';

    public function test_le_titulaire_lit_la_demande_d_origine_en_projection_minimale(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();
        $mr->addMedia(UploadedFile::fake()->image('fuite.jpg'))->toMediaCollection('photos');
        $mr->addMedia(UploadedFile::fake()->image('siphon.jpg'))->toMediaCollection('photos');

        Sanctum::actingAs($prestataire);
        $reponse = $this->getJson($this->url($sp))->assertOk();

        $reponse->assertExactJson(['data' => [
            'id' => $mr->id,
            'title' => 'Fuite sous évier',
            'category' => MaintenanceCategory::Plumbing->value,
            'place' => ['quarter' => 'Mermoz', 'city' => 'Dakar'],
            'photo' => [
                'url' => $reponse->json('data.photo.url'),
                'thumbnail_url' => $reponse->json('data.photo.thumbnail_url'),
                'count' => 2,
            ],
            'quote' => null,
        ]]);
        $this->assertStringContainsString('/media/', (string) $reponse->json('data.photo.url'));
        // Une balise `<img>` n'envoie aucun jeton : l'URL signée se sert sans session (le fichier, ou la redirection
        // vers l'URL présignée du disque, que le navigateur suit) — jamais 401 ni 403.
        $this->app['auth']->forgetGuards();
        $sansJeton = $this->withHeaders(['Authorization' => ''])->get((string) $reponse->json('data.photo.thumbnail_url'));
        $this->assertContains($sansJeton->getStatusCode(), [200, 302]);

        // Rien du logement occupé ni de son occupant, sous aucune clé.
        $corps = $reponse->getContent();
        $this->assertStringNotContainsString(self::RUE, $corps);
        $this->assertStringNotContainsString(self::TELEPHONE_DU_LOCATAIRE, $corps);
        $this->assertStringNotContainsString('Aminata', $corps);
        $this->assertStringNotContainsString('requester', $corps);
        $this->assertStringNotContainsString('latitude', $corps);
        $this->assertStringNotContainsString('Le siphon est fendu', $corps);
    }

    public function test_le_devis_soumis_est_rendu_s_il_existe(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();
        $mr->forceFill(['quote_amount' => 45000, 'quote_currency' => 'XOF', 'quote_submitted_at' => now()])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()
            ->assertJsonPath('data.quote', ['amount' => 45000, 'currency' => 'XOF']);
    }

    public function test_sparse_fieldsets_ne_rendent_que_les_blocs_demandes(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp).'?fields[intervention_d_origine]=title,place,inconnu')
            ->assertOk()
            ->assertExactJson(['data' => ['id' => $mr->id, 'title' => 'Fuite sous évier', 'place' => ['quarter' => 'Mermoz', 'city' => 'Dakar']]]);

        // ADR-0075 : reçue en liste, la valeur vaut absente — tous les blocs.
        $this->getJson($this->url($sp).'?fields[intervention_d_origine][]=title')
            ->assertOk()
            ->assertJsonStructure(['data' => ['id', 'title', 'category', 'place', 'photo', 'quote']]);
    }

    public function test_un_autre_prestataire_est_refuse(): void
    {
        [$sp] = $this->invite();
        [, $autre] = $this->invite('autre@example.com');

        Sanctum::actingAs($autre);
        $this->getJson($this->url($sp))->assertForbidden();
    }

    public function test_l_agence_qui_invite_ne_lit_pas_par_cette_route(): void
    {
        [$sp] = $this->invite();
        $gerant = $this->actingAsRole('agency_admin');

        Sanctum::actingAs($gerant);
        $this->getJson($this->url($sp))->assertForbidden();
    }

    public function test_le_super_admin_passe_la_porte_mais_ne_lit_rien(): void
    {
        [$sp] = $this->invite();
        $this->actingAsRole('super_admin', [], 'sanctum');

        $this->getJson($this->url($sp))->assertOk()->assertExactJson(['data' => null]);
    }

    public function test_le_meme_prestataire_ne_lit_jamais_une_autre_demande(): void
    {
        [$sp, $prestataire, $mr, $agence] = $this->invite();
        $autre = $this->demandeDans($agence, 'Panne de courant');
        $autre->forceFill(['assigned_to' => $prestataire->id])->save();

        Sanctum::actingAs($prestataire);
        // Aucun paramètre ne désigne une demande : un identifiant passé en requête est ignoré.
        $this->getJson($this->url($sp).'?maintenance_request_id='.$autre->id.'&id='.$autre->id)
            ->assertOk()
            ->assertJsonPath('data.id', $mr->id)
            ->assertJsonMissing(['title' => 'Panne de courant']);
    }

    public function test_une_demande_d_une_autre_agence_n_est_pas_rendue(): void
    {
        [$sp, $prestataire, , , $invitation] = $this->invite();
        // L'émission refuse une demande d'une autre agence ; une métadonnée réécrite depuis ne passe pas non plus.
        $etrangere = $this->demandeDans(Agency::factory()->create(), 'Chez une autre agence');
        $invitation->forceFill(['metadata' => ['from_maintenance_request_id' => $etrangere->id]])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()->assertExactJson(['data' => null]);
    }

    public function test_un_lien_deja_consomme_ne_rend_rien(): void
    {
        [$sp, $prestataire, $mr, , $invitation] = $this->invite();
        $invitation->forceFill(['metadata' => [
            'from_maintenance_request_id' => $mr->id,
            'deep_link_consumed_at' => now()->toIso8601String(),
        ]])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()->assertExactJson(['data' => null]);
    }

    /**
     * L'onboarding fini, c'est le lien CONSOMMÉ (`un_lien_deja_consomme_ne_rend_rien`, et la fin du parcours réel) —
     * pas le statut : l'acceptation passe déjà le profil à `active`. Un profil suspendu ou inactif ne lit rien.
     */
    public function test_un_profil_suspendu_ou_inactif_ne_rend_rien(): void
    {
        [$sp, $prestataire] = $this->invite();
        Sanctum::actingAs($prestataire);

        foreach ([ServiceProviderProfileStatus::Suspended, ServiceProviderProfileStatus::Inactive] as $statut) {
            $sp->forceFill(['status' => $statut->value])->save();
            $this->getJson($this->url($sp))->assertOk()->assertExactJson(['data' => null]);
        }
    }

    public function test_un_profil_encore_brouillon_lit_aussi_sa_demande(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();
        $sp->forceFill(['status' => ServiceProviderProfileStatus::Draft->value])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()->assertJsonPath('data.id', $mr->id);
    }

    public function test_une_demande_deja_tenue_ou_commencee_ne_rend_rien(): void
    {
        [$sp, $prestataire, $mr] = $this->invite();
        $mr->forceFill(['assigned_to' => User::factory()->create()->id])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()->assertExactJson(['data' => null]);

        $mr->forceFill(['assigned_to' => null, 'status' => MaintenanceStatus::InProgress])->save();
        $this->getJson($this->url($sp))->assertOk()->assertExactJson(['data' => null]);
    }

    public function test_seule_l_invitation_acceptee_porte_le_lien(): void
    {
        [$sp, $prestataire, , , $invitation] = $this->invite();
        $invitation->forceFill(['status' => InvitationStatus::Sent->value, 'accepted_at' => null])->save();

        Sanctum::actingAs($prestataire);
        $this->getJson($this->url($sp))->assertOk()->assertExactJson(['data' => null]);
    }

    /**
     * Le parcours de l'écran 2, de bout en bout par les vraies routes : l'agence invite depuis la demande, l'invité
     * accepte, lit la demande, puis « Accepter » avec un créneau. AVANT la fin d'onboarding la demande n'est pas à
     * lui (`…/accept` → 403) : c'est pourquoi l'écran finalise d'abord. Après, l'acceptation avec `scheduled_at` passe
     * et rend les clés que le front lit (`scheduled_at`, `accepted_at`) ; la route d'origine ne rend plus rien.
     */
    public function test_le_parcours_de_l_ecran_2_lire_finaliser_puis_accepter_avec_un_creneau(): void
    {
        Mail::fake();
        $agence = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $gerant = User::factory()->create([
            'two_factor_enabled' => true,
            'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET,
        ]);
        AgencyAdminProfile::query()->create(['user_id' => $gerant->id, 'agency_id' => $agence->id]);
        $mr = $this->demandeDans($agence);

        Sanctum::actingAs($gerant);
        $this->postJson("/api/agencies/{$agence->id}/service-providers/invite", [
            'email' => 'plombier@example.com',
            'first_name' => 'Demba',
            'last_name' => 'Sow',
            'phone' => '+221770000099',
            'trades' => ['plumbing'],
            'metadata' => ['from_maintenance_request_id' => $mr->id],
        ])->assertCreated();
        $invitation = Invitation::query()->where('email', 'plombier@example.com')->firstOrFail();
        $this->app['auth']->forgetGuards();
        $this->postJson("/api/invitations/{$invitation->token}/accept", [
            'first_name' => 'Demba',
            'last_name' => 'Sow',
            'password' => 'Secret123!',
        ])->assertOk();

        $sp = ServiceProviderProfile::query()->findOrFail($invitation->invitable_id);
        $prestataire = User::query()->findOrFail($sp->user_id);
        $prestataire->forceFill(['phone_verified_at' => now()])->save();
        Sanctum::actingAs($prestataire);

        // L'acceptation a déjà passé le profil à `active` : c'est le lien non consommé qui ouvre la lecture.
        $this->assertSame(ServiceProviderProfileStatus::Active, $sp->fresh()->status);
        $this->getJson($this->url($sp))->assertOk()->assertJsonPath('data.id', $mr->id);
        $creneau = now()->addDays(3)->setTime(10, 0)->utc()->toIso8601ZuluString();
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => $creneau])->assertForbidden();

        $this->postJson('/api/service-provider/onboard/complete', ['sp_profile_id' => $sp->id])->assertOk();
        $accepte = $this->postJson("/api/maintenance-requests/{$mr->id}/accept", ['scheduled_at' => $creneau])->assertOk();

        $this->assertSame($mr->id, $accepte->json('data.id'));
        $this->assertNotNull($accepte->json('data.accepted_at'));
        $this->assertSame(
            now()->addDays(3)->setTime(10, 0)->utc()->getTimestamp(),
            Carbon::parse($accepte->json('data.scheduled_at'))->getTimestamp(),
        );
        // Le profil n'est plus un brouillon et le lien est consommé : la route ne rend plus rien.
        $this->getJson($this->url($sp))->assertOk()->assertExactJson(['data' => null]);
    }

    private function url(ServiceProviderProfile $sp): string
    {
        return "/api/me/profiles/{$sp->id}/intervention-d-origine";
    }

    private function demandeDans(Agency $agence, string $titre = 'Fuite sous évier'): MaintenanceRequest
    {
        $bien = Property::factory()->create(['agency_id' => $agence->id]);
        Address::factory()->create([
            'addressable_type' => $bien->getMorphClass(),
            'addressable_id' => $bien->id,
            'street' => self::RUE,
            'neighborhood' => 'Mermoz',
            'city' => 'Dakar',
        ]);
        $locataire = User::factory()->create(['first_name' => 'Aminata', 'phone' => self::TELEPHONE_DU_LOCATAIRE]);

        return MaintenanceRequest::factory()->create([
            'property_id' => $bien->id,
            'requester_id' => $locataire->id,
            'title' => $titre,
            'description' => 'Le siphon est fendu, appelez-moi.',
            'category' => MaintenanceCategory::Plumbing,
            'status' => MaintenanceStatus::Open,
            'assigned_to' => null,
        ]);
    }

    /** @return array{ServiceProviderProfile, User, MaintenanceRequest, Agency, Invitation} */
    private function invite(string $email = 'plombier@example.com'): array
    {
        $agence = Agency::factory()->create();
        $mr = $this->demandeDans($agence);
        $prestataire = User::factory()->create(['email' => $email]);
        // L'état réel après l'acceptation : le profil est déjà `active` (InvitationService, P208.02).
        $sp = ServiceProviderProfile::factory()->create([
            'user_id' => $prestataire->id,
            'status' => ServiceProviderProfileStatus::Active->value,
        ]);
        $invitation = Invitation::factory()->accepted()->create([
            'email' => $email,
            'invited_user_id' => $prestataire->id,
            'agency_id' => $agence->id,
            'role' => 'service_provider',
            'invitable_type' => $sp->getMorphClass(),
            'invitable_id' => $sp->id,
            'metadata' => ['from_maintenance_request_id' => $mr->id],
        ]);

        return [$sp, $prestataire, $mr, $agence, $invitation];
    }
}
