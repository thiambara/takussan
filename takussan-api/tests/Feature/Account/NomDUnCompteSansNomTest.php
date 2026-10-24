<?php

namespace Tests\Feature\Account;

use App\Models\AgencyUpgradeRequest;
use App\Models\Conversation;
use App\Models\Enums\ConversationStatus;
use App\Models\Enums\ConversationType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\Review;
use App\Models\User;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Services\Export\ExportDataService;
use App\Services\Messaging\SystemMessageFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P193.05 (TCK-2053) — un compte créé par téléphone (`first_name` et `last_name` vides, `email`
 * nul) n'est plus nommé par rien, ni « Anonyme » :
 *  - `nameWithoutContact()` pour le message système et les exports ;
 *  - `full_name ?: email ?: phone` dans la console de modération et l'avis de demande d'upgrade ;
 *  - « Anonyme » seulement sans `user_id` (côté front).
 *
 * L'avis de gouvernance est gardé dans `GovernanceAlertTest`.
 */
class NomDUnCompteSansNomTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221770000195';

    private function compteParTelephone(array $attributs = []): User
    {
        return User::factory()->create(array_merge([
            'first_name' => '',
            'last_name' => '',
            'email' => null,
            'email_verified_at' => null,
            'username' => null,
            'phone' => self::NUMERO,
            'phone_verified_at' => now(),
        ], $attributs));
    }

    public function test_l_avis_de_demande_d_upgrade_nomme_le_demandeur_par_son_numero(): void
    {
        $demandeur = $this->compteParTelephone();
        $demande = AgencyUpgradeRequest::factory()->pending()->create();

        $courriel = (new AgencyUpgradeRequestSubmittedNotification($demande, $demandeur))
            ->toMail(User::factory()->make());

        $this->assertStringContainsString(self::NUMERO, implode(' ', $courriel->introLines));
    }

    public function test_le_signaleur_d_une_annonce_est_nomme_par_son_numero_dans_la_console(): void
    {
        $signaleur = $this->compteParTelephone();
        PropertyReport::create([
            'property_id' => Property::factory()->create()->id,
            'reporter_user_id' => $signaleur->id,
            'reason' => 'fraud',
            'details' => 'Annonce douteuse.',
        ]);
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/moderation?filter[type]=property&filter[status]=flagged&include=reporter')
            ->assertOk()
            ->assertJsonPath('data.0.reporter.id', $signaleur->id)
            ->assertJsonPath('data.0.reporter.name', self::NUMERO);
    }

    public function test_le_signaleur_d_un_avis_est_nomme_par_son_numero(): void
    {
        $signaleur = $this->compteParTelephone();
        $review = Review::factory()->create([
            'reported_count' => 1,
            'metadata' => ['reports' => [['user_id' => $signaleur->id, 'reason' => 'Spam', 'reported_at' => now()->toISOString()]]],
        ]);
        $this->actingAsRole('super_admin');

        $this->getJson("/api/reviews/{$review->id}/reports")
            ->assertOk()
            ->assertJsonPath('data.0.user.name', self::NUMERO);
    }

    public function test_le_message_systeme_nomme_un_compte_sans_nom_sans_trou_ni_coordonnee(): void
    {
        $auteur = User::factory()->create();
        $arrivant = $this->compteParTelephone();
        $avecEmail = User::factory()->create(['first_name' => '', 'last_name' => '', 'username' => null]);
        $conversation = Conversation::create([
            'type' => ConversationType::Group->value,
            'status' => ConversationStatus::Active->value,
            'subject' => 'Test',
            'created_by' => $auteur->id,
        ]);
        $factory = app(SystemMessageFactory::class);

        $this->assertSame('—', $factory->participantAdded($conversation, $auteur, $arrivant)->metadata['target_name']);
        $this->assertSame('—', $factory->participantAdded($conversation, $auteur, $avecEmail)->metadata['target_name']);
    }

    public function test_l_export_des_baux_nomme_le_bailleur_sans_nom_par_son_identifiant_public(): void
    {
        $bailleur = $this->compteParTelephone(['username' => 'bailleur221']);
        Lease::factory()->active()->create(['landlord_id' => $bailleur->id]);
        $this->actingAsRole('super_admin');

        $export = app(ExportDataService::class)->leases(auth()->user());

        $this->assertSame(['bailleur221'], array_column($export['rows'], 'landlord'));
    }
}
