<?php

namespace Tests\Feature\Public;

use App\Domain\Notifications\NotificationCode;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitWindow;
use App\Models\PropertyVisit;
use App\Notifications\CodedNotification;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-2502 — le visiteur demande « mardi matin » : un jour et une tranche (`preferred_window`), à la
 * place d'une heure. La visite est enregistrée au début de la tranche, à Dakar, et l'heure reste à
 * fixer par l'agent.
 */
class PublicVisitRequestWindowTest extends TestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private function demander(string $slug, array $payload): TestResponse
    {
        return $this->postJson("/api/public/properties/{$slug}/visit-request", $payload + [
            'visitor_name' => 'Awa Ndiaye',
            'visitor_phone' => '771234567',
        ]);
    }

    private function jour(int $jours = 2): string
    {
        return CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays($jours)->format('Y-m-d');
    }

    /** AC1 — `date` + `afternoon` : une visite à 14:00 heure de Dakar, tranche posée, en attente. */
    public function test_une_demande_par_tranche_cree_la_visite_au_debut_de_la_tranche(): void
    {
        Notification::fake();
        $bien = $this->bienDe($this->agence());
        $jour = $this->jour();

        $response = $this->demander($bien->slug, ['date' => $jour, 'preferred_window' => 'afternoon'])->assertCreated();

        $visit = PropertyVisit::query()->findOrFail($response->json('data.id'));
        $this->assertSame(VisitWindow::Afternoon, $visit->preferred_window);
        $this->assertSame(VisitStatus::Scheduled, $visit->status);
        $this->assertSame(
            $jour.' 14:00:00',
            CarbonImmutable::instance($visit->scheduled_at)->setTimezone(VisitSchedulingService::TIMEZONE)->format('Y-m-d H:i:s'),
        );
        $response->assertJsonPath('data.preferred_window', 'afternoon');
    }

    /** AC2 — `scheduled_at` ET une tranche : 422 ; ni l'un ni l'autre : 422 ; un jour sans tranche : 422. */
    public function test_l_heure_et_la_tranche_sont_exclusives(): void
    {
        Notification::fake();
        $bien = $this->bienDe($this->agence());

        $this->demander($bien->slug, ['scheduled_at' => $this->creneau(), 'date' => $this->jour(), 'preferred_window' => 'morning'])
            ->assertUnprocessable();
        $this->demander($bien->slug, ['scheduled_at' => $this->creneau(), 'preferred_window' => 'morning'])
            ->assertUnprocessable();
        $this->demander($bien->slug, [])->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);
        $this->demander($bien->slug, ['date' => $this->jour()])->assertUnprocessable()->assertJsonValidationErrors(['preferred_window']);
        $this->demander($bien->slug, ['preferred_window' => 'morning'])->assertUnprocessable()->assertJsonValidationErrors(['date']);
        $this->demander($bien->slug, ['date' => $this->jour(), 'preferred_window' => 'night'])->assertUnprocessable()->assertJsonValidationErrors(['preferred_window']);

        $this->assertSame(0, PropertyVisit::query()->count());

        // `scheduled_at` seul reste accepté : les appelants actuels ne changent pas.
        $this->demander($bien->slug, ['scheduled_at' => $this->creneau()])->assertCreated()->assertJsonPath('data.preferred_window', null);
    }

    /** Un jour passé, au-delà de 30 jours, ou une tranche déjà entamée aujourd'hui : refusés. */
    public function test_le_jour_est_dans_les_trente_jours_et_la_tranche_pas_entamee(): void
    {
        Notification::fake();
        $bien = $this->bienDe($this->agence());

        $this->demander($bien->slug, ['date' => $this->jour(-1), 'preferred_window' => 'evening'])
            ->assertUnprocessable()->assertJsonValidationErrors(['date']);
        $this->demander($bien->slug, ['date' => $this->jour(31), 'preferred_window' => 'morning'])
            ->assertUnprocessable()->assertJsonValidationErrors(['date']);
        $this->demander($bien->slug, ['date' => $this->jour(30), 'preferred_window' => 'morning'])->assertCreated();

        // Aujourd'hui à 15:00 à Dakar : le matin et l'après-midi sont entamés, la soirée non.
        $this->travelTo(CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->setTime(15, 0));
        $aujourdhui = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->format('Y-m-d');
        $this->demander($bien->slug, ['date' => $aujourdhui, 'preferred_window' => 'afternoon'])
            ->assertUnprocessable()->assertJsonValidationErrors(['preferred_window']);
        $this->demander($bien->slug, ['date' => $aujourdhui, 'preferred_window' => 'evening'])->assertCreated();
    }

    /** L'agence est prévenue de la TRANCHE, l'heure dite « à fixer » — jamais « 14:00 ». */
    public function test_la_notification_dit_la_tranche_et_l_heure_a_fixer(): void
    {
        Notification::fake();
        $x = $this->agence();
        $owner = $this->bailleur($x);
        $bien = $this->bienDe($x, $owner);
        $jour = $this->jour();

        $this->demander($bien->slug, ['date' => $jour, 'preferred_window' => 'afternoon'])->assertCreated();

        Notification::assertNotSentTo($owner, CodedNotification::class, self::deCode(NotificationCode::VisitRequested));
        Notification::assertSentTo($owner, CodedNotification::class, function (CodedNotification $n) use ($jour) {
            return $n->code === NotificationCode::VisitRequestedWindow
                && $n->params['date'] === $jour
                && $n->params['window'] === 'afternoon';
        });

        $rendu = app(NotificationRenderer::class)->format(
            NotificationCode::VisitRequestedWindow,
            ['property' => 'Villa', 'date' => $jour, 'window' => 'afternoon', 'contact' => '+221771234567'],
            'fr',
            'Africa/Dakar',
        );
        $this->assertSame("l'après-midi", $rendu['window']);
        $body = __('notifications.codes.visit.requested_window.body', $rendu, 'fr');
        $this->assertStringContainsString('heure à fixer', $body);
        $this->assertStringNotContainsString('14:00', $body);
    }

    /** Une demande rejouée — même jour, même tranche — rend la visite déjà ouverte. */
    public function test_une_tranche_rejouee_ne_cree_pas_une_seconde_visite_et_ne_se_confond_pas_avec_une_heure(): void
    {
        Notification::fake();
        $bien = $this->bienDe($this->agence());
        $client = $this->client();
        Sanctum::actingAs($client);
        $jour = $this->jour();

        $first = $this->demander($bien->slug, ['date' => $jour, 'preferred_window' => 'afternoon'])->assertCreated()->json('data.id');
        $again = $this->demander($bien->slug, ['date' => $jour, 'preferred_window' => 'afternoon'])->assertCreated()->json('data.id');
        $this->assertSame($first, $again);

        // 14:00 précis le même jour n'est pas « l'après-midi, heure à fixer » : une seconde visite.
        $precise = CarbonImmutable::createFromFormat('!Y-m-d H:i', $jour.' 14:00', VisitSchedulingService::TIMEZONE)->utc()->toIso8601String();
        $other = $this->demander($bien->slug, ['scheduled_at' => $precise])->assertCreated()->json('data.id');
        $this->assertNotSame($first, $other);
    }

    /**
     * Revue — un formulaire qui envoie toujours ses trois champs envoie `scheduled_at: null` à côté
     * de la tranche : c'est un champ ABSENT, pas un conflit. Seul, un `null` reste un 422.
     */
    public function test_scheduled_at_null_avec_une_tranche_vaut_absent(): void
    {
        Notification::fake();
        $bien = $this->bienDe($this->agence());

        $this->demander($bien->slug, ['scheduled_at' => null, 'date' => $this->jour(), 'preferred_window' => 'morning'])
            ->assertCreated()
            ->assertJsonPath('data.preferred_window', 'morning');

        $this->demander($bien->slug, ['scheduled_at' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['scheduled_at']);
        $this->assertSame(1, PropertyVisit::query()->count());
    }
}
