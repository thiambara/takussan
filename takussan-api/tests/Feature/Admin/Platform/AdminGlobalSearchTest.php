<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use App\Services\Admin\AdminGlobalSearchService;
use App\Services\Privacy\PersonalDataAccessLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 — AC19 : la recherche globale de la console, par la base.
 */
class AdminGlobalSearchTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    private function chercher(string $q): array
    {
        return $this->getJson('/api/admin/search?q='.urlencode($q))->assertOk()->json('data');
    }

    public function test_la_reference_d_un_brouillon_prive_rend_ce_bien_en_premier(): void
    {
        $agence = Agency::factory()->create(['name' => 'Keur Immo']);
        $bien = Property::factory()->draft()->create([
            'agency_id' => $agence->id,
            'visibility' => PropertyVisibility::Private,
            'reference_number' => 'TKS-2026-0042',
        ]);
        // Du bruit qui contient la référence en texte libre : il doit venir APRÈS.
        Property::factory()->create(['title' => 'Villa TKS-2026-0042 bis']);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $resultats = $this->chercher('tks-2026-0042');

        $this->assertSame(['type' => 'property', 'id' => $bien->id], ['type' => $resultats[0]['type'], 'id' => $resultats[0]['id']]);
        $this->assertSame(['id' => $agence->id, 'name' => 'Keur Immo'], $resultats[0]['agency']);
        $this->assertSame('TKS-2026-0042', $resultats[0]['sublabel']);
    }

    public function test_diop_trouve_diop_et_le_telephone_se_normalise(): void
    {
        $fatou = User::factory()->create(['first_name' => 'Fatou', 'last_name' => 'Diop', 'phone' => '+221771234567']);
        User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Ndiaye', 'phone' => '+221781234567']);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->assertContains($fatou->id, $this->ids($this->chercher('diop'), 'user'));
        $this->assertContains($fatou->id, $this->ids($this->chercher('fatou DIOP'), 'user'));
        $this->assertSame([$fatou->id], $this->ids($this->chercher('77 123 45 67'), 'user'));
        $this->assertSame([$fatou->id], $this->ids($this->chercher('+221 77 123 45 67'), 'user'));
        $this->assertSame([$fatou->id], $this->ids($this->chercher(strtoupper($fatou->email)), 'user'));
    }

    /** Second chemin de l'e-mail : l'agence n'est cherchée en texte libre que par nom et slug. */
    public function test_l_e_mail_d_une_agence_se_trouve_quelle_que_soit_la_casse(): void
    {
        $agence = Agency::factory()->create(['email' => 'contact@keur-immo.sn']);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->assertSame([$agence->id], $this->ids($this->chercher('CONTACT@Keur-Immo.SN'), 'agency'));
    }

    public function test_un_identifiant_de_transaction_rend_le_paiement_avec_son_agence(): void
    {
        $agence = Agency::factory()->create(['name' => 'Dakar Habitat']);
        $paiement = BookingPayment::factory()->create([
            'booking_id' => Booking::factory()->create(['agency_id' => $agence->id])->id,
            'transaction_id' => 'WAVE-TX-88231',
        ]);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $resultats = collect($this->chercher('WAVE-TX-88231'))->where('type', 'payment')->values();

        $this->assertCount(1, $resultats);
        $this->assertSame($paiement->id, $resultats[0]['id']);
        $this->assertSame(['id' => $agence->id, 'name' => 'Dakar Habitat'], $resultats[0]['agency']);
    }

    /** NINEA : par l'agence (en clair), jamais par la demande de passage (chiffrée par TCK-601). */
    public function test_le_ninea_se_cherche_dans_l_agence_jamais_dans_la_demande(): void
    {
        $agence = Agency::factory()->create(['metadata' => ['legal_info' => ['ninea' => '005012345']]]);
        AgencyUpgradeRequest::factory()->create(['ninea' => '009876543']);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->assertSame([$agence->id], $this->ids($this->chercher('005012345'), 'agency'));
        $this->assertSame([], $this->chercher('009876543'));
    }

    public function test_cinq_resultats_au_plus_par_type_et_les_jokers_sont_litteraux(): void
    {
        User::factory()->count(7)->create(['last_name' => 'Sarr']);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $this->assertCount(AdminGlobalSearchService::PER_TYPE, $this->ids($this->chercher('sarr'), 'user'));
        $this->assertSame([], $this->ids($this->chercher('%%%'), 'user'));
        $this->assertSame([], $this->ids($this->chercher('s_r'), 'user'));
    }

    public function test_un_admin_d_agence_et_un_viewer_sont_refuses_et_q_est_borne(): void
    {
        $this->actingAsRole('agency_admin');
        $this->getJson('/api/admin/search?q=diop')->assertForbidden();

        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $this->getJson('/api/admin/search?q=diop')->assertForbidden();

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->getJson('/api/admin/search?q=d')->assertUnprocessable();
        $this->getJson('/api/admin/search?q='.str_repeat('a', 101))->assertUnprocessable();
    }

    /**
     * Raccord TCK-601 (ADR-0044 §4) — un compte RENDU par la recherche est une consultation tracée,
     * au nom de l'opérateur ; un compte écarté (non trouvé, ou au-delà des cinq) ne l'est pas, une
     * recherche refusée n'écrit rien, et un rafraîchissement dans la fenêtre ne double pas la trace.
     */
    public function test_chaque_compte_rendu_est_une_consultation_tracee(): void
    {
        $fatou = User::factory()->create(['first_name' => 'Fatou', 'last_name' => 'Diop']);
        $awa = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $diops = User::factory()->count(AdminGlobalSearchService::PER_TYPE + 1)->create(['last_name' => 'Diopsy']);

        $this->actingAsRole('agency_admin');
        $this->getJson('/api/admin/search?q=diop')->assertForbidden();
        $this->assertSame([], $this->consultations());

        $operateur = $this->agirEnOperateur(PlatformProfileLevel::Support);
        $rendus = $this->ids($this->chercher('diop'), 'user');
        $this->chercher('diop');

        $this->assertCount(AdminGlobalSearchService::PER_TYPE, $rendus);
        $this->assertEqualsCanonicalizing($rendus, $this->consultations(), 'un compte rendu = une trace, une seule');
        $this->assertNotContains($awa->id, $this->consultations());
        $ecartes = collect([$fatou, ...$diops])->pluck('id')->diff($rendus);
        $this->assertNotEmpty($ecartes);
        $this->assertSame([], $ecartes->intersect($this->consultations())->values()->all(), 'un compte écarté n\'est pas consulté');

        $trace = Activity::query()->where('log_name', PersonalDataAccessLogger::LOG_NAME)->firstOrFail();
        $this->assertSame($operateur->id, (int) $trace->causer_id);
        $this->assertSame(PersonalDataAccessLogger::SURFACE_GLOBAL_SEARCH, $trace->properties['surface']);
    }

    /**
     * La trace suit la COUPE, pas les requêtes : l'égalité (téléphone) et le texte libre rendent
     * ensemble six comptes, la recherche en garde cinq — le sixième, lu puis écarté, n'est pas tracé.
     */
    public function test_le_compte_ecarte_par_la_coupe_n_est_pas_trace(): void
    {
        $parTelephone = User::factory()->create(['phone' => '+221771234567']);
        $parTexte = collect(range(1, AdminGlobalSearchService::PER_TYPE))
            ->map(fn (int $n) => User::factory()->create(['username' => "+221771234567-{$n}"]));
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $rendus = $this->ids($this->chercher('+221771234567'), 'user');

        $this->assertCount(AdminGlobalSearchService::PER_TYPE, $rendus);
        $this->assertSame($parTelephone->id, $rendus[0], 'l\'égalité passe en tête');
        $ecartes = $parTexte->pluck('id')->diff($rendus)->values()->all();
        $this->assertCount(1, $ecartes);
        $this->assertEqualsCanonicalizing($rendus, $this->consultations());
    }

    /**
     * Une recherche REFUSÉE ne consulte rien : ni par un viewer (403), ni par une requête trop
     * courte ou trop longue (422). Le viewer et la requête trop longue visent un compte que la
     * recherche rendrait sinon (le témoin le montre). `q=d`, lui, ne trace rien par construction
     * (texte libre à 3 caractères, rien d'exact) : il garde le statut, pas la trace.
     */
    public function test_une_recherche_refusee_n_ecrit_aucune_trace(): void
    {
        $diop = User::factory()->create(['last_name' => 'Diop']);
        $long = str_repeat('x', 92).'@cible.sn';
        $parEmail = User::factory()->create(['email' => $long]);
        $this->assertSame(101, mb_strlen($long));

        $this->agirEnOperateur(PlatformProfileLevel::Viewer);
        $this->getJson('/api/admin/search?q=diop')->assertForbidden();

        $this->agirEnOperateur(PlatformProfileLevel::Support);
        $this->getJson('/api/admin/search?q=d')->assertUnprocessable();
        $this->getJson('/api/admin/search?q='.urlencode($long))->assertUnprocessable();

        $this->assertSame([], $this->consultations());

        // Témoin : la même recherche, autorisée et bornée, rend le compte et le trace.
        $this->assertContains($diop->id, $this->ids($this->chercher('diop'), 'user'));
        $this->assertContains($diop->id, $this->consultations());
        $this->assertNotContains($parEmail->id, $this->consultations());
    }

    /** @return list<int> */
    private function consultations(): array
    {
        return Activity::query()
            ->where('log_name', PersonalDataAccessLogger::LOG_NAME)
            ->where('subject_type', (new User)->getMorphClass())
            ->pluck('subject_id')->map(fn ($id) => (int) $id)->all();
    }

    /** @return list<int> */
    private function ids(array $resultats, string $type): array
    {
        return collect($resultats)->where('type', $type)->pluck('id')->values()->all();
    }
}
