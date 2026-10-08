<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-598 (B1, contraintes 1 et 2) — **une route `public.*` ne dépend pas de l'appelant, et ne
 * rend jamais les collaborateurs d'un bien.**
 *
 * `show()` et `compare()` chargent `collaborators.user` parce que `PrimaryPropertyContact` en a
 * besoin ; `PropertyResource` sérialisait la relation dès qu'elle était chargée — la part de
 * commission et le rôle de chaque agent partaient donc à un anonyme. Le défaut n'est pas le
 * chargement (le retirer ferait un N+1 sans rien fermer), c'est la sérialisation.
 *
 * La seconde moitié est la condition du cache partagé de la fiche (ADR-0052 §1) : avec le jeton du
 * PROPRIÉTAIRE du bien — le seul qui ouvre `viewRaw` — le corps est identique, octet pour octet,
 * au corps anonyme. Champs de modération, original signé et `?raw=1` compris.
 */
class PropertyCollaboratorsNotExposedTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array{0: Property, 1: User, 2: User} le bien, son propriétaire, l'agent collaborateur */
    private function bienAvecCollaborateur(): array
    {
        Storage::fake('public');

        $owner = User::factory()->create();
        $agency = Agency::factory()->create([
            'primary_admin_id' => $owner->id,
            'settings' => ['watermark_enabled' => true],
        ]);
        $this->materializeRoleProfile($owner, 'agency_admin', $agency);
        $agent = User::factory()->withAgentProfile($agency)->create();

        $property = Property::factory()->published()->create([
            'agency_id' => $agency->id,
            'user_id' => $owner->id,
            // Les quatre traces de modération : un état que la modération ne produit pas, posé pour
            // qu'une émission conditionnée à `$request->user()` se voie.
            'submitted_at' => now()->subDays(3),
            'approved_at' => now()->subDay(),
            'rejected_at' => now()->subDays(2),
            'rejection_reason' => 'Photos illisibles.',
        ]);
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value,
            'commission_share' => 30,
            'invited_at' => now()->subWeek(),
        ]);
        $property->addMedia(UploadedFile::fake()->image('photo.jpg'))
            ->usingFileName('photo.jpg')
            ->toMediaCollection('photos');

        return [$property, $owner, $agent];
    }

    /** @return array<string, string> un vrai jeton Sanctum : c'est le chemin de production */
    private function porteur(User $user): array
    {
        return ['Authorization' => 'Bearer '.$user->createToken('tck-598')->plainTextToken];
    }

    private function assertSansCollaborateurs(string $corps, string $route): void
    {
        $this->assertStringNotContainsString('"collaborators"', $corps, "{$route} émet la clé `collaborators`.");
        $this->assertStringNotContainsString('commission_share', $corps, "{$route} émet une part de commission.");
    }

    /** AC1 — la fiche, anonyme puis avec le jeton d'un inconnu ; le contact reste l'agent. */
    public function test_la_fiche_ne_rend_jamais_les_collaborateurs(): void
    {
        [$property, , $agent] = $this->bienAvecCollaborateur();

        $anonyme = $this->getJson("/api/public/properties/{$property->slug}")->assertOk();
        $this->assertSansCollaborateurs($anonyme->getContent(), 'show (anonyme)');
        $anonyme->assertJsonMissingPath('data.collaborators');
        $anonyme->assertJsonPath('data.primary_contact.id', $agent->id);

        $inconnu = $this->getJson("/api/public/properties/{$property->slug}", $this->porteur(User::factory()->create()))
            ->assertOk();
        $this->assertSansCollaborateurs($inconnu->getContent(), 'show (jeton quelconque)');
        $inconnu->assertJsonPath('data.primary_contact.id', $agent->id);
    }

    /** AC1 — le comparateur, même chargement, même règle. */
    public function test_le_comparateur_ne_rend_jamais_les_collaborateurs(): void
    {
        [$property, , $agent] = $this->bienAvecCollaborateur();

        $anonyme = $this->getJson("/api/public/properties/compare?ids={$property->id}")->assertOk();
        $this->assertSansCollaborateurs($anonyme->getContent(), 'compare (anonyme)');
        $anonyme->assertJsonPath('data.0.primary_contact.id', $agent->id);

        $inconnu = $this->getJson("/api/public/properties/compare?ids={$property->id}", $this->porteur(User::factory()->create()))
            ->assertOk();
        $this->assertSansCollaborateurs($inconnu->getContent(), 'compare (jeton quelconque)');
    }

    /**
     * Second chemin — toutes les autres routes `public.*` qui sérialisent un bien, avec
     * `include=collaborators` forcé et le jeton du propriétaire. Aucune ne passe par spatie, mais
     * c'est la règle de la ressource qui doit tenir, pas l'absence d'`include` d'aujourd'hui.
     */
    public function test_aucune_route_publique_ne_rend_les_collaborateurs_meme_sur_demande(): void
    {
        [$property, $owner] = $this->bienAvecCollaborateur();
        $jeton = $this->porteur($owner);
        $agence = $property->agency->slug;

        foreach ([
            "/api/public/properties/{$property->slug}?include=collaborators",
            '/api/public/properties?include=collaborators',
            "/api/public/properties/by-ids?ids={$property->id}&include=collaborators",
            "/api/public/properties/compare?ids={$property->id}&include=collaborators",
            '/api/public/properties/discovery?include=collaborators',
            "/api/public/agencies/{$agence}/properties?include=collaborators",
            "/api/public/properties/{$property->slug}/similar?include=collaborators",
        ] as $url) {
            $this->assertSansCollaborateurs($this->getJson($url, $jeton)->assertOk()->getContent(), $url);
        }
    }

    /**
     * AC3 (contrainte 2) — le jeton du PROPRIÉTAIRE ne change rien au corps de la fiche : ni
     * champs de modération, ni e-mail, ni original signé, ni `?raw=1`. Rougit sur `e3ab4a4e`.
     */
    public function test_le_corps_de_la_fiche_ne_depend_pas_de_l_appelant(): void
    {
        [$property, $owner] = $this->bienAvecCollaborateur();
        $jeton = $this->porteur($owner);

        $anonyme = $this->getJson("/api/public/properties/{$property->slug}")->assertOk()->getContent();
        $proprietaire = $this->getJson("/api/public/properties/{$property->slug}", $jeton)->assertOk()->getContent();
        $brut = $this->getJson("/api/public/properties/{$property->slug}?raw=1", $jeton)->assertOk()->getContent();

        $this->assertSame($anonyme, $proprietaire, 'Le jeton du propriétaire change le corps de la fiche publique.');
        $this->assertSame($anonyme, $brut, '`?raw=1` avec le jeton du propriétaire change le corps de la fiche publique.');
        $this->assertStringNotContainsString('photo.jpg', $brut, 'L\'original non filigrané sort sur une route publique.');
        $this->assertStringNotContainsString('rejection_reason', $proprietaire);
    }

    /** Second chemin de la contrainte 2 — le comparateur, avec le même jeton. */
    public function test_le_corps_du_comparateur_ne_depend_pas_de_l_appelant(): void
    {
        [$property, $owner] = $this->bienAvecCollaborateur();

        $url = "/api/public/properties/compare?ids={$property->id}";
        $anonyme = $this->getJson($url)->assertOk()->getContent();
        $proprietaire = $this->getJson($url.'&raw=1', $this->porteur($owner))->assertOk()->getContent();

        $this->assertSame($anonyme, $proprietaire);
    }

    /** AC2 — la route authentifiée garde les collaborateurs : le tableau de bord n'est pas vidé. */
    public function test_la_route_authentifiee_rend_toujours_la_part_de_commission(): void
    {
        [$property, $owner, $agent] = $this->bienAvecCollaborateur();

        Sanctum::actingAs($owner);
        $reponse = $this->getJson("/api/properties/{$property->id}")
            ->assertOk()
            ->assertJsonPath('data.collaborators.0.user_id', $agent->id);
        $this->assertEquals(30, $reponse->json('data.collaborators.0.commission_share'));
    }
}
