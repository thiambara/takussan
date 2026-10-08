<?php

namespace Tests\Feature\Admin\Platform;

use App\Domain\Notifications\NotificationCode;
use App\Models\AccountDeletionRequest;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Account\AccountDeletionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Scout\EngineManager;
use Laravel\Scout\Engines\NullEngine;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 — AC7b : un compte effacé ne laisse aucun bien public sans contact.
 *
 * Trois biens publics `available`, et un compte effacé par `account:execute-deletions` sur une
 * demande échue :
 *  (a) bien sans agence dont il est propriétaire → dépublié ;
 *  (b) bien d'agence dont il est le seul agent et le propriétaire → dépublié, admins prévenus ;
 *  (c) bien d'agence où un second agent, B, reste → public, B répond, personne n'est prévenu.
 *
 * Le moteur de recherche est espionné : `unsearchable` doit partir pour (a) et (b), jamais (c).
 */
class AccountErasureListingsTest extends TestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use OperateursPlateforme;
    use RefreshDatabase;

    private object $moteur;

    private User $efface;

    private User $adminAgence;

    private User $agentB;

    private Property $a;

    private Property $b;

    private Property $c;

    protected function setUp(): void
    {
        parent::setUp();

        $this->moteur = new class extends NullEngine
        {
            /** @var list<int> */
            public array $retires = [];

            public function delete($models)
            {
                array_push($this->retires, ...$models->whereInstanceOf(Property::class)->map->getKey()->all());
            }
        };
        $moteur = $this->moteur;
        app(EngineManager::class)->extend('espion', fn () => $moteur);
        config(['scout.driver' => 'espion']);
        app(EngineManager::class)->forgetDrivers();
        // `TestCase::setUp()` coupe la synchronisation de tout modèle indexable : la rallumer ici,
        // sans quoi l'observateur de Scout ne dirait rien et l'assertion d'index serait vide.
        Property::enableSearchSyncing();

        $agence = $this->agence();
        $this->adminAgence = $this->personnel($agence, 'agency_admin');
        $this->efface = $this->personnel($agence);
        $this->agentB = $this->personnel($agence);

        $this->a = $this->bienDe(null, $this->efface);
        $this->b = $this->bienDe($agence, $this->efface);
        $this->collaborateur($this->b, $this->efface);
        $this->c = $this->bienDe($agence);
        $this->collaborateur($this->c, $this->efface, '2026-01-10 09:00:00');
        $this->collaborateur($this->c, $this->agentB, '2026-02-10 09:00:00');

        $this->moteur->retires = [];
    }

    public function test_la_demande_de_l_utilisateur_executee_depublie_a_et_b_et_garde_c(): void
    {
        app(AccountDeletionService::class)->requestDeletion($this->efface, 'Je quitte le Sénégal.');
        $this->executerLesDemandesEchues();

        $this->assertResultat();
    }

    public function test_la_demande_de_la_console_executee_depublie_a_et_b_et_garde_c(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson("/api/admin/users/{$this->efface->id}/erase", ['reason' => 'Demande écrite reçue par courrier.'])
            ->assertStatus(202);
        $this->app['auth']->forgetGuards();
        $this->executerLesDemandesEchues();

        $this->assertResultat();
    }

    private function executerLesDemandesEchues(): void
    {
        Notification::fake();
        AccountDeletionRequest::query()->update(['scheduled_for' => now()->subMinute()]);
        $this->artisan('account:execute-deletions')->assertSuccessful();
        $this->assertNotNull(AccountDeletionRequest::query()->sole()->executed_at);
    }

    private function assertResultat(): void
    {
        $publics = collect($this->getJson('/api/public/properties?per_page=50')->assertOk()->json('data'))->pluck('id');

        foreach ([$this->a, $this->b] as $bien) {
            $this->getJson("/api/public/properties/{$bien->slug}")->assertNotFound();
            $this->assertNotContains($bien->id, $publics);
            $frais = $bien->fresh();
            $this->assertSame(PropertyStatus::Draft, $frais->status);
            $this->assertSame(PropertyVisibility::Private, $frais->visibility);
            $this->assertNull($frais->published_at);
            $this->assertFalse($frais->shouldBeSearchable());
            $this->assertTrue(Activity::query()
                ->where('event', 'property.unpublished_on_account_erasure')
                ->where('subject_id', $bien->id)
                ->exists());
        }

        $this->getJson("/api/public/properties/{$this->c->slug}")->assertOk();
        $this->assertContains($this->c->id, $publics);
        $this->assertSame($this->agentB->phone, $this->getJson("/api/public/properties/{$this->c->slug}/contact")->json('phone'));

        $this->assertEqualsCanonicalizing([$this->a->id, $this->b->id], array_values(array_unique($this->moteur->retires)));

        $avis = Notification::sent($this->adminAgence, CodedNotification::class, self::deCode(NotificationCode::PropertyUnpublishedContactErased));
        $this->assertSame([$this->b->id], $avis->map(fn (CodedNotification $n) => $n->target['id'] ?? null)->all());

        $execution = Activity::query()->where('event', 'account.deletion.executed')->sole();
        $this->assertEqualsCanonicalizing([$this->a->id, $this->b->id], $execution->properties['unpublished_property_ids']);
    }
}
