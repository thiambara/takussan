<?php

namespace Tests\Feature\Documents;

use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\DocumentType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Services\Documents\RechercheDuCoffre;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Meilisearch\Endpoints\Indexes;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-2769 — chercher dans le coffre par le serveur : `GET /api/me/document-vault?filter[search]=`.
 *
 * La recherche ne retient que des entrées du coffre déjà jugé : elle n'élargit ni la règle des
 * documents internes, ni la règle d'auteur, ni la lecture seule du bailleur bloqué. Chaque garde a
 * son test, et chaque document interdit CORRESPOND à la requête et passe le filtre du moteur ; un
 * témoin autorisé, de même terme, est trouvé. Meilisearch réel (`InteractsWithMeilisearch`) : sans
 * index, un « pas trouvé » ne prouverait rien.
 */
class DocumentVaultSearchTest extends TestCase
{
    use CoffreDeDocuments;
    use InteractsWithMeilisearch;
    use RefreshDatabase;
    use SessionsDImpersonation;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
    }

    /** @return array<string, mixed> la réponse entière (data, meta) */
    private function chercher(string $q, array $extra = []): array
    {
        return $this->getJson('/api/me/document-vault?'.http_build_query(['filter' => ['search' => $q]] + $extra))
            ->assertOk()->json();
    }

    /** @return list<int> les identifiants des pièces trouvées */
    private function pieces(array $reponse): array
    {
        return array_values(array_map('intval', array_filter(array_column($reponse['data'], 'document_id'))));
    }

    private function televerser(Customer $fiche, string $nom, array $extra = []): int
    {
        return (int) $this->post('/api/documents', [
            'documentable_type' => 'customer',
            'documentable_id' => $fiche->id,
            'name' => $nom,
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('note.pdf', 12, 'application/pdf'),
        ] + $extra, ['Accept' => 'application/json'])->assertCreated()->json('data.id');
    }

    /**
     * Un moteur espion : il relève les identifiants CANDIDATS qu'il rend, et peut en ajouter (un moteur
     * qui ment, ou un filtre qui laisse passer trop).
     *
     * @param  list<int>  $injectes
     */
    private function moteurEspion(array $injectes = []): RechercheDuCoffre
    {
        $espion = new class extends RechercheDuCoffre
        {
            /** @var list<int> */
            public array $injectes = [];

            /** @var list<int> */
            public array $candidats = [];

            protected function interroger(Indexes $index, string $query, array $options): array
            {
                $reponse = parent::interroger($index, $query, $options);
                $reponse['hits'] = [...$reponse['hits'], ...array_map(fn (int $id): array => ['id' => $id], $this->injectes)];
                $this->candidats = array_map(fn (array $hit): int => (int) $hit['id'], $reponse['hits']);

                return $reponse;
            }
        };
        $espion->injectes = $injectes;
        $this->app->instance(RechercheDuCoffre::class, $espion);

        return $espion;
    }

    private function ficheDuLocataire(): Customer
    {
        return Customer::query()->where('user_id', $this->tenant->id)->where('agency_id', $this->agency->id)->firstOrFail();
    }

    /** AC1 — « quittance » trouve les quittances GÉNÉRÉES ; une recherche des seuls téléversements échouerait. */
    public function test_ac1_quittance_trouve_les_quittances_generees_de_l_annee(): void
    {
        $this->waitForMeilisearch();
        $this->connecter($this->tenant);

        $reponse = $this->chercher('quittance');
        $loyers = array_slice($this->paid, 1); // le premier est la caution : « Reçu de caution »
        $this->assertEqualsCanonicalizing(
            array_map(fn ($p) => "/api/leases/{$this->lease->id}/receipts/{$p->id}/pdf", $loyers),
            array_column($reponse['data'], 'download_path'),
        );
        $this->assertSame(5, $reponse['meta']['total']);
        foreach ($reponse['data'] as $entree) {
            $this->assertSame('generated', $entree['kind']);
            $this->assertSame(['key' => 'receipts:2026', 'kind' => 'receipts', 'name' => null, 'year' => 2026, 'read_only' => false], $entree['folder']);
        }
        // Plus récentes d'abord.
        $this->assertSame('2026-05-05', $reponse['data'][0]['date']);

        // Le mois, en français comme en anglais, et la catégorie en anglais.
        $mars = $this->chercher('quittance de mars');
        $this->assertSame(["/api/leases/{$this->lease->id}/receipts/{$this->paid[3]->id}/pdf"], array_column($mars['data'], 'download_path'));
        $this->assertSame(array_column($mars['data'], 'download_path'), array_column($this->chercher('March receipt')['data'], 'download_path'));
        $this->assertSame(["/api/leases/{$this->lease->id}/receipts/{$this->paid[0]->id}/pdf"], array_column($this->chercher('caution')['data'], 'download_path'));

        // Le contrat et l'état des lieux, par le libellé que l'écran en montre.
        $this->assertContains("/api/leases/{$this->lease->id}/contract/pdf", array_column($this->chercher('contrat')['data'], 'download_path'));
        $this->assertContains("/api/inventories/{$this->signedInventory->id}/pdf", array_column($this->chercher('état des lieux')['data'], 'download_path'));
    }

    /** AC2 — « assurance » trouve la pièce déposée, pas celle d'un autre bail ni celle du bien. */
    public function test_ac2_assurance_trouve_sa_piece_et_pas_celle_d_un_autre_bail(): void
    {
        $autre = $this->document($this->otherLease, $this->admin, DocumentType::Insurance, 'Assurance habitation');
        $this->waitForMeilisearch();

        $this->connecter($this->tenant);
        $this->assertSame([$this->insurance->id], $this->pieces($this->chercher('assurance')));
        // Le moteur : tolérance aux fautes, bornée au coffre.
        $this->assertSame([$this->insurance->id], $this->pieces($this->chercher('asurance habitation')));

        // Témoin : l'autre locataire trouve la sienne, et le bien n'est à aucun des deux.
        $this->connecter($this->otherTenant);
        $this->assertSame([$autre->id], $this->pieces($this->chercher('asurance habitation')));
        $this->assertNotContains($this->adminDocOnProperty->id, $this->pieces($this->chercher('assurance')));
    }

    /** Une pièce se trouve aussi par le libellé de son type, que l'index ne cherche pas. */
    public function test_une_piece_se_trouve_par_le_libelle_de_son_type(): void
    {
        $scan = $this->document($this->tenant, $this->tenant, DocumentType::Insurance, 'scan-0042.pdf');
        $this->waitForMeilisearch();
        $this->connecter($this->tenant);

        $this->assertEqualsCanonicalizing([$this->insurance->id, $scan->id], $this->pieces($this->chercher('assurance')));
        $this->assertEqualsCanonicalizing([$this->insurance->id, $scan->id], $this->pieces($this->chercher('insurance')));
    }

    /**
     * AC3 — l'agent suspendu ne retrouve pas l'interne qu'il a déposé (TCK-2759 r4), et le sujet de la
     * fiche non plus. Le filtre du moteur les laisse passer tous deux (son téléversement, sa fiche).
     */
    public function test_ac3_l_interne_n_est_trouve_ni_par_l_agent_suspendu_ni_par_le_sujet(): void
    {
        $fiche = $this->ficheDuLocataire();
        $this->connecter($this->agent);
        $interne = $this->televerser($fiche, 'Note de solvabilité');
        $visible = $this->televerser($fiche, 'Solvabilité, pièce visible', ['is_internal' => '0']);
        $this->waitForMeilisearch();

        // Témoins : l'agent actif trouve les deux ; le sujet trouve la visible.
        $this->connecter($this->agent);
        $this->assertEqualsCanonicalizing([$interne, $visible], $this->pieces($this->chercher('solvabilit')));
        $this->connecter($this->tenant);
        $sujet = $this->chercher('solvabilit');
        $this->assertSame([$visible], $this->pieces($sujet));
        $this->assertSame(1, $sujet['meta']['total']);

        AgentProfile::query()->where('user_id', $this->agent->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $this->connecter($this->agent);
        $this->getJson("/api/documents/{$interne}")->assertForbidden();
        $suspendu = $this->chercher('solvabilit');
        $this->assertSame([], $suspendu['data']);
        $this->assertSame(0, $suspendu['meta']['total']);
    }

    /** Le bailleur bloqué trouve les pièces de son bien, en lecture seule, et rien de ce que `view` lui refuse. */
    public function test_le_bailleur_bloque_trouve_en_lecture_seule(): void
    {
        $owner = OwnerProfile::query()->where('user_id', $this->landlord->id)->sole();
        $this->waitForMeilisearch();

        $this->connecter($this->landlord, $owner);
        $actif = $this->chercher('assurance');
        $this->assertSame([$this->adminDocOnProperty->id], $this->pieces($actif));
        $this->assertFalse($actif['data'][0]['folder']['read_only']);

        $owner->update(['status' => OwnerProfileStatus::Blocked]);
        $this->connecter($this->landlord);
        $bloque = $this->chercher('assurance');
        $this->assertSame([$this->adminDocOnProperty->id], $this->pieces($bloque));
        $this->assertSame(['key' => "property:{$this->property->id}", 'kind' => 'property', 'name' => 'Villa Almadies', 'year' => null, 'read_only' => true], $bloque['data'][0]['folder']);
        // La pièce du locataire (son compte) n'est pas au bailleur.
        $this->assertNotContains($this->insurance->id, $this->pieces($bloque));
    }

    /**
     * Un candidat du moteur que l'appelant ne lit pas ne sort jamais : le coffre retient ses entrées
     * APRÈS le moteur. Le moteur ment ici : il rend en plus l'assurance d'un autre bail, la pièce du
     * bien et l'interne de la fiche, toutes trois refusées au locataire.
     */
    public function test_un_candidat_du_moteur_que_l_appelant_ne_lit_pas_ne_sort_jamais(): void
    {
        $autre = $this->document($this->otherLease, $this->admin, DocumentType::Insurance, 'Assurance habitation');
        $this->connecter($this->agent);
        $interne = $this->televerser($this->ficheDuLocataire(), 'Assurance, note interne');
        $this->waitForMeilisearch();

        $interdits = [$autre->id, $this->adminDocOnProperty->id, $interne];
        $espion = $this->moteurEspion($interdits);
        $this->connecter($this->tenant);
        $reponse = $this->chercher('assurance');

        foreach ($interdits as $id) {
            $this->assertContains($id, $espion->candidats);
            $this->getJson("/api/documents/{$id}")->assertForbidden();
        }
        $this->assertSame([$this->insurance->id], $this->pieces($reponse));
        $this->assertSame(1, $reponse['meta']['total']);
    }

    /**
     * Sous impersonation, la recherche ne rend que ce que le coffre rend à la personne impersonée : ni
     * pièce de profil (TCK-697), ni document interne (TCK-2759), quoique le moteur les rende tous deux.
     * Et elle n'ouvre aucune écriture : ni cible de rattachement dans sa réponse, ni dépôt accepté.
     * Chaque cas a son versant autorisé, sous le jeton de la personne elle-même.
     */
    public function test_sous_impersonation_la_recherche_ne_rend_que_le_coffre_de_la_personne(): void
    {
        $profil = OwnerProfile::query()->where('user_id', $this->landlord->id)->sole();
        $pieceDuProfil = $this->document($profil, $this->landlord, DocumentType::IdCard, 'Quitus fiscal du profil');
        $pieceDuCompte = $this->document($this->landlord, $this->landlord, DocumentType::Other, 'Quitus fiscal du compte');
        $fiche = $this->ficheDuLocataire();
        $this->connecter($this->agent);
        $interne = $this->televerser($fiche, 'Note de solvabilité');
        $visible = $this->televerser($fiche, 'Solvabilité, pièce visible', ['is_internal' => '0']);
        $this->waitForMeilisearch();

        // Versant autorisé : le bailleur, sous son propre jeton, trouve ses deux pièces.
        $this->connecter($this->landlord, $profil);
        $this->assertEqualsCanonicalizing([$pieceDuProfil->id, $pieceDuCompte->id], $this->pieces($this->chercher('quitus')));

        // Le bailleur impersoné : la pièce de profil (une pièce d'identité sur son profil) est candidate, et ne
        // sort pas ; celle de son compte, si.
        $espion = $this->moteurEspion();
        $session = $this->ouvrirUneSession(cible: $this->landlord);
        $this->avecLeJeton($session['jeton']);
        $bailleur = $this->chercher('quitus');
        $this->assertContains($pieceDuProfil->id, $espion->candidats);
        $this->assertSame([$pieceDuCompte->id], $this->pieces($bailleur));
        $this->assertSame(1, $bailleur['meta']['total']);
        $this->assertSame(['data', 'meta'], array_keys($bailleur));

        // Le locataire impersoné : l'interne de sa fiche est candidate, et ne sort pas.
        $session = $this->ouvrirUneSession(cible: $this->tenant);
        $this->avecLeJeton($session['jeton']);
        $locataire = $this->chercher('solvabilit');
        $this->assertContains($interne, $espion->candidats);
        $this->assertSame([$visible], $this->pieces($locataire));
        $this->assertSame(1, $locataire['meta']['total']);

        // Aucune écriture : rien à quoi joindre, et un dépôt est refusé.
        $this->assertSame([], $this->coffre()['attachable_targets']);
        $this->post('/api/documents', [
            'documentable_type' => 'customer',
            'documentable_id' => $fiche->id,
            'name' => 'Dépôt sous impersonation',
            'type' => DocumentType::Other->value,
            'file' => UploadedFile::fake()->create('note.pdf', 12, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertForbidden();
    }

    /** AC4 — le total et les pages sont ceux du serveur. */
    public function test_ac4_le_total_et_les_pages_sont_ceux_du_serveur(): void
    {
        $this->waitForMeilisearch();
        $this->connecter($this->tenant);

        $tout = array_column($this->chercher('quittance')['data'], 'download_path');
        $pages = [];
        foreach ([1, 2, 3] as $page) {
            $reponse = $this->chercher('quittance', ['per_page' => 2, 'page' => $page]);
            $this->assertSame(['total' => 5, 'per_page' => 2, 'current_page' => $page, 'last_page' => 3], $reponse['meta']);
            $pages = [...$pages, ...array_column($reponse['data'], 'download_path')];
        }
        $this->assertSame($tout, $pages);
        $this->assertSame([], $this->chercher('quittance', ['per_page' => 2, 'page' => 4])['data']);
        $this->getJson('/api/me/document-vault?filter[search]=x&per_page=51')->assertUnprocessable();
    }

    /** Sans recherche, ou une recherche vide, le coffre garde sa forme. */
    public function test_sans_recherche_le_coffre_garde_sa_forme(): void
    {
        $this->connecter($this->tenant);
        $sans = $this->getJson('/api/me/document-vault')->assertOk()->json();
        $vide = $this->getJson('/api/me/document-vault?filter[search]=')->assertOk()->json();
        $this->assertSame($sans, $vide);
        $this->assertSame(['folders', 'counts', 'attachable_targets'], array_keys($sans['data']));
        $this->assertArrayNotHasKey('meta', $sans);
    }

    /** Le moteur est borné, DANS sa requête, aux porteurs du coffre : ni le bail ni le bien d'un autre. */
    public function test_le_moteur_est_borne_au_perimetre_du_coffre(): void
    {
        $espion = new class extends RechercheDuCoffre
        {
            /** @var list<string> */
            public array $filtres = [];

            protected function interroger(Indexes $index, string $query, array $options): array
            {
                $this->filtres[] = (string) $options['filter'];

                return parent::interroger($index, $query, $options);
            }
        };
        $this->app->instance(RechercheDuCoffre::class, $espion);
        $this->connecter($this->tenant);
        $this->chercher('assurance');

        $this->assertCount(1, $espion->filtres);
        $filtre = $espion->filtres[0];
        $this->assertStringContainsString("uploaded_by = {$this->tenant->id}", $filtre);
        $this->assertSame(1, preg_match('/documentable_type = "App\\\\\\\\Models\\\\\\\\Lease" AND documentable_id IN \[([^\]]*)\]/', $filtre, $m));
        $baux = array_map('intval', explode(', ', $m[1]));
        $this->assertContains($this->lease->id, $baux);
        $this->assertNotContains($this->otherLease->id, $baux);
        $this->assertStringNotContainsString('"App\\\\Models\\\\Property"', $filtre);
    }
}
