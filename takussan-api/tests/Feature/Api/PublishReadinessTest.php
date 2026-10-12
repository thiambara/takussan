<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Property\PublishReadiness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\PubliePret;
use Tests\TestCase;

/**
 * TCK-633 (lot C, AC11) — publier exige un contact principal joignable (prénom, numéro vérifié)
 * et des CGU acceptées par le publieur ; la première publication les date. Par l'API, sur les
 * quatre chemins qui rendent un bien public : `publish`, `visibility`, `store`, `update`.
 */
class PublishReadinessTest extends TestCase
{
    use PubliePret, RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = User::factory()->create(['first_name' => 'Awa', 'phone' => '+221770000901', 'phone_verified_at' => null]);
        Sanctum::actingAs($this->user);
    }

    private function brouillon(?User $auteur = null, array $attributs = []): Property
    {
        return Property::factory()->draft()->create($attributs + ['user_id' => ($auteur ?? $this->user)->id, 'agency_id' => null]);
    }

    public function test_sans_numero_verifie_refuse(): void
    {
        $bien = $this->brouillon();

        $this->postJson("/api/properties/{$bien->id}/publish", ['accept_terms' => true])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'property.publish_contact_incomplete')
            ->assertJsonPath('missing', ['verified_phone'])
            ->assertJsonPath('contact_is_self', true);
        $this->assertSame(PropertyStatus::Draft, $bien->fresh()->status);
        // Un refus ne date pas les CGU, même cochées.
        $this->assertNull($this->user->fresh()->terms_accepted_at);
    }

    public function test_sans_prenom_refuse(): void
    {
        $this->rendrePubliable($this->user);
        $this->user->forceFill(['first_name' => ''])->save();

        $this->postJson("/api/properties/{$this->brouillon()->id}/publish", ['accept_terms' => true])
            ->assertUnprocessable()->assertJsonPath('missing', ['first_name']);
    }

    public function test_sans_cgu_refuse(): void
    {
        $this->user->forceFill(['phone_verified_at' => now()])->save();

        $this->postJson("/api/properties/{$this->brouillon()->id}/publish")
            ->assertUnprocessable()->assertJsonPath('missing', ['terms']);
    }

    public function test_tout_manque_dans_l_ordre(): void
    {
        $this->user->forceFill(['first_name' => ''])->save();

        $this->postJson("/api/properties/{$this->brouillon()->id}/publish")
            ->assertUnprocessable()->assertJsonPath('missing', ['first_name', 'verified_phone', 'terms']);
    }

    public function test_la_premiere_publication_date_les_cgu_et_pas_les_suivantes(): void
    {
        $this->user->forceFill(['phone_verified_at' => now()])->save();
        $this->freezeSecond();

        $this->postJson("/api/properties/{$this->brouillon()->id}/publish", ['accept_terms' => true])
            ->assertOk()->assertJsonPath('data.visibility', 'public');
        $premiere = $this->user->fresh()->terms_accepted_at;
        $this->assertNotNull($premiere);
        $this->assertSame(PublishReadiness::TERMS_VERSION, $this->user->fresh()->terms_version);

        $this->travel(2)->days();
        $this->postJson("/api/properties/{$this->brouillon()->id}/publish", ['accept_terms' => true])->assertOk();
        $this->assertTrue($premiere->equalTo($this->user->fresh()->terms_accepted_at));
    }

    public function test_la_visibilite_publique_est_gardee(): void
    {
        $bien = $this->brouillon();

        $this->putJson("/api/properties/{$bien->id}/visibility", ['visibility' => 'public'])
            ->assertUnprocessable()->assertJsonPath('code', 'property.publish_contact_incomplete');
        $this->assertSame(PropertyStatus::Draft, $bien->fresh()->status);
    }

    public function test_la_creation_publique_est_gardee(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['phone_verified_at' => null]);
        $this->materializeRoleProfile($agent, 'agent', $agency);
        Sanctum::actingAs($agent);

        $this->postJson('/api/properties', [
            'title' => 'Villa aux Almadies', 'type' => 'house', 'contract_type' => 'sale',
            'price' => 90_000_000, 'status' => 'available', 'visibility' => 'public',
        ])->assertUnprocessable()->assertJsonPath('code', 'property.publish_contact_incomplete');
        $this->assertSame(0, Property::query()->count());
    }

    /** Une création publique acceptée date les CGU du créateur, comme `publish`. */
    public function test_la_creation_publique_acceptee_date_les_cgu(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['first_name' => 'Moussa', 'phone' => '+221770000903', 'phone_verified_at' => now()]);
        $this->materializeRoleProfile($agent, 'agent', $agency);
        Sanctum::actingAs($agent);

        $this->postJson('/api/properties', [
            'title' => 'Villa aux Almadies', 'type' => 'house', 'contract_type' => 'sale',
            'price' => 90_000_000, 'status' => 'available', 'visibility' => 'public', 'accept_terms' => true,
        ])->assertCreated();
        $this->assertSame(PublishReadiness::TERMS_VERSION, $agent->fresh()->terms_version);
    }

    /** Créer un brouillon privé n'est pas publier : rien n'est exigé. */
    public function test_la_creation_privee_n_exige_rien(): void
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create(['phone_verified_at' => null]);
        $this->materializeRoleProfile($agent, 'agent', $agency);
        Sanctum::actingAs($agent);

        $this->postJson('/api/properties', [
            'title' => 'Studio à Ouakam', 'type' => 'house', 'contract_type' => 'rent',
            'price' => 150_000, 'visibility' => 'private',
        ])->assertCreated();
    }

    public function test_la_mise_a_jour_publique_est_gardee(): void
    {
        $bien = $this->brouillon(null, ['visibility' => PropertyVisibility::Private]);

        $this->putJson("/api/properties/{$bien->id}", ['visibility' => 'public'])
            ->assertUnprocessable()->assertJsonPath('code', 'property.publish_contact_incomplete');
        $this->assertSame(PropertyVisibility::Private, $bien->fresh()->visibility);
    }

    public function test_republier_un_bien_deja_en_ligne_ne_redemande_rien(): void
    {
        $enLigne = Property::factory()->create(['user_id' => $this->user->id, 'agency_id' => null]);

        $this->postJson("/api/properties/{$enLigne->id}/publish")->assertOk();
    }

    /**
     * Vérification adverse du lot C, S2 — un bien publié, retiré par son STATUT, garde `visibility`
     * et `published_at`. Le remettre `available` le rend public : c'est une publication, et le
     * contact qui a perdu son numéro vérifié entre-temps doit la bloquer, sans rien écrire.
     */
    private function publiePuisRetireParSonStatut(): Property
    {
        $this->rendrePubliable($this->user);
        $bien = $this->brouillon();
        $this->postJson("/api/properties/{$bien->id}/publish")->assertOk();
        $this->putJson("/api/properties/{$bien->id}/status", ['status' => 'unavailable'])->assertOk();
        $this->assertFalse(Property::query()->public()->whereKey($bien->id)->exists());

        return $bien;
    }

    /**
     * Correction du lot C, tour 2 — TOUS les statuts affichables, pas seulement `available` :
     * réduire `statusPutsOnline` à `available` laissait `published` (proposé par le menu Statut)
     * et `pending` remettre un bien en ligne sans contrôle, et le lot restait vert.
     *
     * @return array<string, array{string}>
     */
    public static function statutsAffichables(): array
    {
        return ['available' => ['available'], 'published' => ['published'], 'pending' => ['pending']];
    }

    #[DataProvider('statutsAffichables')]
    public function test_remettre_en_ligne_par_le_statut_est_garde(string $statut): void
    {
        $this->assertNotContains($statut, Property::NON_PUBLIC_STATUSES);
        $bien = $this->publiePuisRetireParSonStatut();
        $this->user->forceFill(['phone_verified_at' => null])->save();

        $this->putJson("/api/properties/{$bien->id}/status", ['status' => $statut])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'property.publish_contact_incomplete')
            ->assertJsonPath('missing', ['verified_phone']);
        $this->assertSame(PropertyStatus::Unavailable, $bien->fresh()->status);
        $this->assertFalse(Property::query()->public()->whereKey($bien->id)->exists());
    }

    public function test_republier_un_bien_retire_par_son_statut_est_garde(): void
    {
        $bien = $this->publiePuisRetireParSonStatut();
        $this->user->forceFill(['phone_verified_at' => null])->save();

        $this->postJson("/api/properties/{$bien->id}/publish")
            ->assertUnprocessable()
            ->assertJsonPath('code', 'property.publish_contact_incomplete');
        $this->assertSame(PropertyStatus::Unavailable, $bien->fresh()->status);
    }

    /** Le même détour par le corps de `PUT /properties/{id}` (`status` y est accepté). */
    public function test_remettre_en_ligne_par_la_mise_a_jour_du_statut_est_garde(): void
    {
        $bien = $this->publiePuisRetireParSonStatut();
        $this->user->forceFill(['phone_verified_at' => null])->save();

        $this->putJson("/api/properties/{$bien->id}", ['status' => 'available'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'property.publish_contact_incomplete');
        $this->assertSame(PropertyStatus::Unavailable, $bien->fresh()->status);
    }

    public function test_remettre_en_ligne_par_le_statut_avec_un_contact_complet(): void
    {
        $bien = $this->publiePuisRetireParSonStatut();

        $this->putJson("/api/properties/{$bien->id}/status", ['status' => 'available'])
            ->assertOk()->assertJsonPath('data.status', 'available');
        $this->assertTrue(Property::query()->public()->whereKey($bien->id)->exists());
    }

    /**
     * Correction du lot C, tour 3 — le REJEU de la boîte « Avant de publier » depuis le menu
     * « Statut » : `PUT …/status {status, accept_terms: true}` pour un compte sans CGU. Sans ce
     * test, ignorer `accept_terms` dans `updateStatus` laissait tout vert, et le « Publier » de la
     * boîte renvoyait le même refus `[terms]` sans fin (revérification 2, défaut 2).
     */
    public function test_le_rejeu_du_statut_avec_accept_terms_remet_en_ligne_et_date_les_cgu(): void
    {
        $bien = $this->publiePuisRetireParSonStatut();
        $this->user->forceFill(['terms_accepted_at' => null, 'terms_version' => null])->save();
        $this->freezeSecond();

        // Le premier geste : le refus qui ouvre la boîte.
        $this->putJson("/api/properties/{$bien->id}/status", ['status' => 'available'])
            ->assertUnprocessable()->assertJsonPath('missing', ['terms']);
        $this->assertNull($this->user->fresh()->terms_accepted_at);

        // Le rejeu de la boîte.
        $this->putJson("/api/properties/{$bien->id}/status", ['status' => 'available', 'accept_terms' => true])
            ->assertOk()->assertJsonPath('data.status', 'available');
        $this->assertTrue(now()->equalTo($this->user->fresh()->terms_accepted_at));
        $this->assertSame(PublishReadiness::TERMS_VERSION, $this->user->fresh()->terms_version);
        $this->assertTrue(Property::query()->public()->whereKey($bien->id)->exists());
    }

    /** Retirer un bien par son statut n'est pas publier : rien n'est exigé. */
    public function test_retirer_par_le_statut_n_exige_rien(): void
    {
        $enLigne = Property::factory()->create(['user_id' => $this->user->id, 'agency_id' => null]);

        $this->putJson("/api/properties/{$enLigne->id}/status", ['status' => 'unavailable'])->assertOk();
    }

    /** Le contact est l'agent principal, pas le publieur : c'est lui qui doit être joignable. */
    public function test_le_contact_principal_d_un_bien_d_agence(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);
        $this->rendrePubliable($admin);
        $agent = User::factory()->create(['phone' => '+221770000902', 'phone_verified_at' => null]);
        $this->materializeRoleProfile($agent, 'agent', $agency);
        $bien = Property::factory()->draft()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        PropertyCollaborator::create([
            'property_id' => $bien->id, 'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value, 'invited_at' => '2026-01-01 09:00:00',
        ]);
        Sanctum::actingAs($admin);

        $this->postJson("/api/properties/{$bien->id}/publish", ['accept_terms' => true])
            ->assertUnprocessable()
            ->assertJsonPath('missing', ['verified_phone'])
            ->assertJsonPath('contact_is_self', false);
    }
}
