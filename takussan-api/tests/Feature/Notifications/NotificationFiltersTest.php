<?php

namespace Tests\Feature\Notifications;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\AppNotification;
use App\Models\Enums\NotificationType;
use App\Models\User;
use App\Notifications\Boost\BoostEndedNotification;
use App\Services\Model\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2633 — `GET /api/notifications` : `famille` et `a_traiter` sur chaque ligne, `filter[famille]`
 * et `filter[a_traiter]` cumulables avec `filter[unread]`, et `meta.counts` sur les non-lues.
 *
 * Les lignes sont écrites par les VRAIS émetteurs (`BoostEndedNotification`, sans code ;
 * `NotificationService::send`, par code) : une ligne bâtie à la main cacherait ce qu'un émetteur
 * stocke réellement (code absent, type `system`).
 */
class NotificationFiltersTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create();
    }

    /** L'admin de la maquette : 16 « Mise en avant terminée » et 1 « Visite demandée », non lues. */
    private function laClocheDeLAdmin(): void
    {
        for ($i = 1; $i <= 16; $i++) {
            $this->admin->notify(new BoostEndedNotification($i, "Bien {$i}"));
        }
        $this->visiteDemandee($this->admin);
    }

    private function visiteDemandee(User $user): ?AppNotification
    {
        return app(NotificationService::class)->send($user, NotificationCode::VisitRequested, [
            'property' => 'Studio meublé, Mermoz',
            'scheduled_at' => now()->addDay()->toIso8601String(),
            'timezone' => 'Africa/Dakar',
            'contact' => 'Awa Ndiaye',
        ], NotificationTarget::of('visit', 1));
    }

    /** AC1 */
    public function test_a_traiter_ne_rend_que_la_visite_demandee(): void
    {
        $this->laClocheDeLAdmin();
        Sanctum::actingAs($this->admin);

        $response = $this->getJson('/api/notifications?filter[a_traiter]=1')->assertOk();

        $this->assertSame(['visit.requested'], array_column($response->json('data'), 'code'));
        $response->assertJsonPath('data.0.famille', 'visite')
            ->assertJsonPath('data.0.a_traiter', true)
            ->assertJsonPath('meta.counts.a_traiter_non_lues', 1)
            ->assertJsonPath('meta.total', 1);
    }

    /**
     * AC2. La « Mise en avant terminée » est écrite SANS code, en `system`, avec une cible
     * `property` : la cible stockée la range en `bien` (décision du 2026-11-11, Notes du ticket).
     */
    public function test_par_famille_ne_compte_que_les_familles_presentes(): void
    {
        $this->laClocheDeLAdmin();
        Sanctum::actingAs($this->admin);

        $counts = $this->getJson('/api/notifications')->assertOk()->json('meta.counts.par_famille');

        $this->assertSame(['bien' => 16, 'visite' => 1], $this->trie($counts));
    }

    /** AC3 — une ligne sans code (une classe qui rend encore son texte), de type `payment`. */
    public function test_une_ligne_sans_code_de_type_paiement(): void
    {
        $ligne = AppNotification::query()->create([
            'user_id' => $this->admin->id,
            'type' => NotificationType::Payment,
            'title' => 'Pénalité de retard appliquée',
            'sent_at' => now(),
        ]);
        Sanctum::actingAs($this->admin);

        $row = collect($this->getJson('/api/notifications')->assertOk()->json('data'))->firstWhere('id', $ligne->id);

        $this->assertSame('paiement', $row['famille']);
        $this->assertFalse($row['a_traiter']);
    }

    public function test_familles_en_liste_a_traiter_et_non_lues_se_cumulent(): void
    {
        $this->laClocheDeLAdmin();
        $lue = $this->visiteDemandee($this->admin);
        $lue?->update(['read_at' => now(), 'is_read' => true]);
        app(NotificationService::class)->send($this->admin, NotificationCode::LeadReceived, [
            'name' => 'Moussa Diallo', 'contact' => '+221770000000', 'message' => 'Est-elle toujours disponible ?',
        ], NotificationTarget::of('lead', 3));
        app(NotificationService::class)->send($this->admin, NotificationCode::BookingConfirmed, [
            'reference' => 'BK-1', 'property' => 'Villa', 'start_date' => '2026-12-01', 'end_date' => '2026-12-05',
        ]);
        Sanctum::actingAs($this->admin);

        $codes = fn (string $requete): array => array_count_values(array_column(
            $this->getJson('/api/notifications?per_page=50&'.$requete)->assertOk()->json('data'),
            'code',
        ));

        $this->assertEquals(['visit.requested' => 2, 'lead.received' => 1, 'booking.confirmed' => 1], $codes('filter[famille]=visite,demande'));
        $this->assertEquals(['visit.requested' => 2, 'lead.received' => 1, 'booking.confirmed' => 1], $codes('filter[famille][]=visite&filter[famille][]=demande'));
        $this->assertEquals(['visit.requested' => 2, 'lead.received' => 1], $codes('filter[famille]=visite,demande&filter[a_traiter]=1'));
        $this->assertEquals(['visit.requested' => 1, 'lead.received' => 1], $codes('filter[famille]=visite,demande&filter[a_traiter]=1&filter[unread]=1'));
        // Une ligne sans code n'est jamais à traiter : les 16 mises en avant n'y sont pas.
        $aTraiter = $this->getJson('/api/notifications?per_page=50&filter[a_traiter]=1')->json('data');
        $this->assertNotContains(null, array_column($aTraiter, 'code'));
        // `bien` rend les lignes sans code dont la cible est un bien ; `systeme` ne les rend pas.
        $this->assertCount(16, $this->getJson('/api/notifications?per_page=50&filter[famille]=bien')->json('data'));
        $this->assertSame([], $this->getJson('/api/notifications?per_page=50&filter[famille]=systeme')->json('data'));
    }

    public function test_les_comptes_ne_portent_que_sur_les_non_lues_et_ignorent_les_filtres(): void
    {
        $this->laClocheDeLAdmin();
        $this->visiteDemandee($this->admin)?->update(['read_at' => now(), 'is_read' => true]);
        $this->visiteDemandee(User::factory()->create());
        Sanctum::actingAs($this->admin);

        foreach (['', 'filter[famille]=avis', 'filter[a_traiter]=1&filter[unread]=1'] as $filtres) {
            $meta = $this->getJson('/api/notifications?'.$filtres)->assertOk()->json('meta');
            $this->assertSame(17, $meta['unread'], $filtres);
            $this->assertSame(1, $meta['counts']['a_traiter_non_lues'], $filtres);
            $this->assertSame(['bien' => 16, 'visite' => 1], $this->trie($meta['counts']['par_famille']), $filtres);
        }
    }

    public function test_sans_non_lue_par_famille_est_un_objet_vide(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->getJson('/api/notifications')->assertOk();

        $this->assertStringContainsString('"par_famille":{}', $response->getContent());
        $response->assertJsonPath('meta.counts.a_traiter_non_lues', 0);
    }

    /** La ressource, le filtre et le compte lisent la même table : pour chaque branche, ils s'accordent. */
    public function test_la_ligne_le_filtre_et_le_compte_s_accordent(): void
    {
        $this->laClocheDeLAdmin();
        app(NotificationService::class)->send($this->admin, NotificationCode::ReviewToModerate, ['subject' => 'Villa', 'rating' => 2]);
        AppNotification::query()->create(['user_id' => $this->admin->id, 'type' => NotificationType::Payment, 'title' => 'x', 'sent_at' => now()]);
        AppNotification::query()->create(['user_id' => $this->admin->id, 'type' => NotificationType::Booking, 'code' => 'code.disparu', 'title' => 'x', 'sent_at' => now()]);
        // Sans code : une cible qui ne tranche pas (`lease`), une cible de `systeme`, un genre inconnu.
        AppNotification::query()->create(['user_id' => $this->admin->id, 'type' => NotificationType::Payment, 'target' => ['kind' => 'lease', 'id' => 4], 'title' => 'x', 'sent_at' => now()]);
        AppNotification::query()->create(['user_id' => $this->admin->id, 'type' => NotificationType::System, 'target' => ['kind' => 'credits'], 'title' => 'x', 'sent_at' => now()]);
        AppNotification::query()->create(['user_id' => $this->admin->id, 'type' => NotificationType::Visit, 'target' => ['kind' => 'genre_disparu'], 'title' => 'x', 'sent_at' => now()]);
        Sanctum::actingAs($this->admin);

        $tout = $this->getJson('/api/notifications?per_page=50')->assertOk();
        $parLigne = array_count_values(array_column($tout->json('data'), 'famille'));
        $this->assertSame($this->trie($parLigne), $this->trie($tout->json('meta.counts.par_famille')));

        foreach ($parLigne as $famille => $n) {
            $filtrees = $this->getJson("/api/notifications?per_page=50&filter[famille]={$famille}")->json('data');
            $this->assertCount($n, $filtrees, $famille);
            $this->assertSame([$famille], array_values(array_unique(array_column($filtrees, 'famille'))), $famille);
        }
    }

    /** @return array<string, array{0: string}> */
    public static function malFormes(): array
    {
        return [
            'famille inconnue' => ['filter[famille]=visite,fusee', 'filter.famille'],
            'famille en objet' => ['filter[famille][a][b]=visite', 'filter.famille'],
            'a_traiter non booléen' => ['filter[a_traiter]=peut-etre', 'filter.a_traiter'],
            'unread non booléen' => ['filter[unread]=oui', 'filter.unread'],
        ];
    }

    #[DataProvider('malFormes')]
    public function test_un_filtre_mal_forme_est_refuse(string $requete, string $champ): void
    {
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/notifications?'.$requete)->assertUnprocessable()->assertJsonValidationErrors($champ);
    }

    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_notifications(): void
    {
        Sanctum::actingAs($this->admin);
        $this->visiteDemandee($this->admin);
        $peu = $this->requetes('/api/notifications?filter[famille]=visite,systeme');

        $this->laClocheDeLAdmin();
        app(NotificationService::class)->send($this->admin, NotificationCode::ReviewToModerate, ['subject' => 'Villa', 'rating' => 2]);
        $beaucoup = $this->requetes('/api/notifications?filter[famille]=visite,systeme');

        $this->assertSame($peu, $beaucoup);
    }

    public function test_les_champs_clairsemes_rendent_famille_et_a_traiter(): void
    {
        $this->visiteDemandee($this->admin);
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/notifications?fields[app_notifications]=id,famille,a_traiter')
            ->assertOk()
            ->assertExactJson([
                'data' => [['id' => AppNotification::query()->sole()->id, 'famille' => 'visite', 'a_traiter' => true]],
                'meta' => $this->getJson('/api/notifications')->json('meta'),
            ]);
    }

    private function requetes(string $url): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson($url)->assertOk();
        $n = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $n;
    }

    /**
     * @param  array<string, int>|null  $comptes
     * @return array<string, int>
     */
    private function trie(?array $comptes): array
    {
        $comptes ??= [];
        ksort($comptes);

        return $comptes;
    }
}
