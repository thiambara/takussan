<?php

namespace Tests\Feature\Lease;

use App\Models\Agency;
use App\Models\User;
use App\Services\Lease\LeaseSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2642, AC3 — `filter[search]` de la liste des baux : la référence du bail, le nom et le
 * téléphone du locataire, le titre et la référence du bien ({@see LeaseSearch}).
 * La recherche ne fait que restreindre la portée de l'index : le bail d'une autre agence n'y entre
 * jamais. Casse repliée (ICU, accents compris dans la casse), accents non repliés (ADR-0020 §2).
 */
class LeaseSearchTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $owner = $this->bailleur($this->agency);

        $this->bail($this->bienLoue($this->agency, $owner, 'Villa des Almadies', ['reference_number' => 'PR-ALMA-01']), 'Mamadou SECK', ['reference_number' => 'LS-0DPA-2026'], '+221 77 123 45 67');
        $this->bail($this->bienLoue($this->agency, $owner, 'Studio Plateau'), 'Élodie NDIAYE', ['reference_number' => 'LS-7XQ1-2026'], '+221 78 555 00 11');
        $this->bail($this->bienLoue($this->agency, $owner, 'Duplex Mermoz'), 'Awa FALL', ['reference_number' => 'LS-9KLM-2026'], '+221 76 222 33 44');

        $other = $this->agence();
        $this->bail($this->bienLoue($other, $this->bailleur($other), 'Villa voisine'), 'Ibrahima SECK', ['reference_number' => 'LS-0DPA-9999'], '+221 77 123 45 99');
    }

    /** @return list<string> */
    private function search(string $q): array
    {
        $this->actingAsApi($this->admin);
        $refs = array_column($this->getJson('/api/leases?fields[leases]=id,reference_number&filter[search]='.rawurlencode($q))->assertOk()->json('data'), 'reference_number');
        sort($refs);

        return $refs;
    }

    public function test_ac3_le_nom_du_locataire_sans_la_casse(): void
    {
        $this->assertSame(['LS-0DPA-2026'], $this->search('seck'), 'le SECK de l\'autre agence reste hors portée');
        $this->assertSame(['LS-0DPA-2026'], $this->search('Mamadou'));
    }

    public function test_ac3_la_reference_du_bail(): void
    {
        $this->assertSame(['LS-0DPA-2026'], $this->search('LS-0DPA'));
        $this->assertSame(['LS-0DPA-2026'], $this->search('ls-0dpa'));
    }

    public function test_le_titre_et_la_reference_du_bien(): void
    {
        $this->assertSame(['LS-0DPA-2026'], $this->search('almadies'));
        $this->assertSame(['LS-0DPA-2026'], $this->search('PR-ALMA'));
        $this->assertSame(['LS-7XQ1-2026'], $this->search('plateau'));
    }

    public function test_le_telephone_par_ses_seuls_chiffres(): void
    {
        $this->assertSame(['LS-0DPA-2026'], $this->search('77 123 45'));
        $this->assertSame(['LS-0DPA-2026'], $this->search('771234567'));
        $this->assertSame(['LS-7XQ1-2026'], $this->search('+221 78 555'));
    }

    /** La casse se replie au-delà de l'ASCII (`CaseInsensitive`) ; l'accent, lui, compte. */
    public function test_la_casse_se_replie_hors_ascii_l_accent_non(): void
    {
        $this->assertSame(['LS-7XQ1-2026'], $this->search('élodie'));
        $this->assertSame(['LS-7XQ1-2026'], $this->search('ÉLODIE'));
        $this->assertSame([], $this->search('elodie'));
    }

    public function test_chaque_mot_doit_trouver_un_champ(): void
    {
        $this->assertSame(['LS-0DPA-2026'], $this->search('seck almadies'));
        $this->assertSame([], $this->search('seck plateau'));
    }

    public function test_les_jokers_sont_pris_au_pied_de_la_lettre_et_une_saisie_courte_est_ignoree(): void
    {
        $this->assertSame([], $this->search('%%'));
        $this->assertCount(3, $this->search('s'));
    }
}
