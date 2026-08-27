<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-441 — l'adresse de connexion quitte la surface publique, et le contact reste anonyme.
 */
class AgentContactLeadTest extends TestCase
{
    use RefreshDatabase;

    private function agent(): User
    {
        $agency = Agency::factory()->create();
        $agent = User::factory()->create([
            'username' => 'awa-diop',
            'email' => 'awa@example.test',
            'phone' => '+221771234567',
        ]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        return $agent->fresh(['agency']);
    }

    /**
     * AC1 — l'inspection porte sur la CHARGE ENTIÈRE, sérialisée, et non sur une liste de clés
     * attendues. Une adresse réapparue sous un autre nom, ou nichée dans `agency` ou dans un
     * élément de `portfolio`, doit faire rougir ce test — ce qu'un `assertJsonMissingPath`
     * ne ferait pas.
     */
    public function test_public_agent_payload_carries_no_login_address(): void
    {
        $agent = $this->agent();

        $response = $this->getJson('/api/public/agents/awa-diop')->assertOk();

        $this->assertStringNotContainsString($agent->email, $response->getContent());
    }

    /** Le téléphone RESTE public — décision du ticket, éprouvée dans les deux sens. */
    public function test_public_agent_payload_still_carries_the_phone(): void
    {
        $this->agent();

        $this->getJson('/api/public/agents/awa-diop')
            ->assertOk()
            ->assertJsonPath('data.phone', '+221771234567');
    }

    /**
     * AC2 — la garde qui compte : le défaut vivait dans le CONTOURNEMENT.
     * `PublicAgencyController` retirait déjà l'adresse du bandeau d'équipe, et `/agents/{slug}`
     * la resservait à un clic de là. Un test qui ne couvrirait que la fiche d'agent laisserait
     * repasser exactement ce chemin.
     */
    public function test_no_public_route_serves_the_login_address_of_that_user(): void
    {
        $agent = $this->agent();
        $agency = $agent->agency;

        $routes = [
            '/api/public/agents/awa-diop',
            '/api/public/agents/awa-diop/properties',
            '/api/public/agencies/'.$agency->slug,
            '/api/public/agencies/'.$agency->slug.'/properties',
        ];

        foreach ($routes as $route) {
            $response = $this->getJson($route);
            $this->assertStringNotContainsString(
                $agent->email,
                $response->getContent(),
                "L'adresse de connexion de l'agent fuit par {$route}",
            );
        }
    }

    /**
     * AC3 — SANS jeton. Un test authentifié validerait le contraire de ce que le ticket demande :
     * le contact public de ce dépôt est anonyme, et il doit le rester.
     */
    public function test_anonymous_visitor_can_contact_an_agent_and_a_lead_is_recorded(): void
    {
        $agent = $this->agent();

        $this->postJson('/api/public/agents/awa-diop/contact-lead', [
            'name' => 'Moussa Fall',
            'email' => 'moussa@example.test',
            'message' => 'Bonjour, je cherche un F3 aux Almadies.',
        ])->assertCreated();

        $lead = PropertyContactLead::query()->latest('id')->first();

        $this->assertNotNull($lead);
        $this->assertNull($lead->property_id);
        $this->assertSame($agent->id, $lead->recipient_user_id);
        $this->assertSame($agent->agency->id, $lead->agency_id);
        $this->assertSame('moussa@example.test', $lead->email);
    }

    /** Le pot de miel accepte sans écrire — répondre 422 apprendrait au robot quel champ éviter. */
    public function test_honeypot_is_accepted_without_persisting(): void
    {
        $this->agent();

        $this->postJson('/api/public/agents/awa-diop/contact-lead', [
            'name' => 'Bot',
            'email' => 'bot@example.test',
            'message' => 'Bonjour bonjour',
            'company' => 'ACME',
        ])->assertCreated();

        $this->assertSame(0, PropertyContactLead::query()->count());
    }

    public function test_contact_lead_on_unknown_agent_returns_404(): void
    {
        $this->postJson('/api/public/agents/inconnu/contact-lead', [
            'name' => 'Moussa Fall',
            'email' => 'moussa@example.test',
            'message' => 'Bonjour, je cherche un F3.',
        ])->assertNotFound();
    }

    public function test_contact_lead_validates_its_payload(): void
    {
        $this->agent();

        $this->postJson('/api/public/agents/awa-diop/contact-lead', [
            'name' => '',
            'email' => 'pas-une-adresse',
            'message' => 'x',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'email', 'message']);
    }

    /**
     * AC5 — la barrière anti-abus est le throttle, puisque ce n'est pas l'authentification.
     * `public-contact-lead` autorise 5 requêtes par 10 minutes, comme pour un bien.
     */
    public function test_contact_lead_is_rate_limited_like_the_property_one(): void
    {
        $this->agent();

        $payload = [
            'name' => 'Moussa Fall',
            'email' => 'moussa@example.test',
            'message' => 'Bonjour, je cherche un F3 aux Almadies.',
        ];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/public/agents/awa-diop/contact-lead', $payload)->assertCreated();
        }

        $this->postJson('/api/public/agents/awa-diop/contact-lead', $payload)
            ->assertStatus(429);
    }
}
