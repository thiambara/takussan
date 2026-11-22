<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\InteractsWithMeilisearch;
use Tests\Support\CoffreDeDocuments;
use Tests\Support\MaintenanceActors;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-2895 (ADR-0099, amendement du 2026-11-15, « le coffre de l'agence ») —
 * `GET /api/agency/document-vault` (l'arbre compté) et `GET /api/documents?filter[agency]=current`
 * (la liste de l'agence, ses générés par `filter[generated]=1`), pour le personnel actif de l'agence du
 * profil actif. La liste suit la lecture : tout ce que l'arbre compte et que la liste rend s'ouvre en
 * `show`, et rien d'une autre agence n'y entre.
 *
 * Le décor du coffre (`CoffreDeDocuments`), plus, sur le bail du premier locataire, deux pièces : l'une
 * vérifiée qui expire dans 42 jours, l'autre non vérifiée — avec l'avenant de l'admin, vérifié ici, ce
 * sont les trois « Pièces du locataire » d'AC1. Le locataire s'appelle Niang (AC4). Une autre agence a
 * son bien et sa pièce ; l'agence a son NINEA (dossier de l'agence).
 */
class AgencyDocumentVaultTest extends TestCase
{
    use CoffreDeDocuments;
    use InteractsWithMeilisearch;
    use MaintenanceActors;
    use RefreshDatabase;
    use SessionsDImpersonation;

    private Document $expiring;

    private Document $unverified;

    private Document $ninea;

    private Property $foreignProperty;

    private Document $foreignDoc;

    private Document $draftLeaseDoc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();

        $this->property->address()->create(['street' => '12 rue des Almadies', 'neighborhood' => 'Almadies', 'city' => 'Dakar', 'country' => 'SN']);
        Customer::query()->whereKey($this->lease->tenant_id)->sole()->update(['first_name' => 'Awa', 'last_name' => 'Niang']);
        Customer::query()->whereKey($this->otherLease->tenant_id)->sole()->update(['first_name' => 'Moussa', 'last_name' => 'Sarr']);

        $this->adminDocOnLease->update(['is_verified' => true]);
        $this->adminDocOnOtherLease->update(['is_verified' => true]);
        $this->expiring = $this->document($this->lease, $this->admin, DocumentType::Insurance, 'Attestation d\'assurance', Document::today()->addDays(42)->toDateString());
        $this->expiring->update(['is_verified' => true]);
        $this->unverified = $this->document($this->lease, $this->agent, DocumentType::Other, 'Bulletin de salaire');
        $this->ninea = $this->document($this->agency, $this->admin, DocumentType::Ninea, 'NINEA de l\'agence');
        $this->draftLeaseDoc = $this->document($this->draftLease, $this->admin, DocumentType::Other, 'Pièce du brouillon');

        $foreign = Agency::factory()->create();
        $this->foreignProperty = Property::factory()->create(['agency_id' => $foreign->id, 'title' => 'Villa d\'ailleurs']);
        $this->foreignDoc = $this->document($this->foreignProperty, User::factory()->create(), DocumentType::Other, 'Pièce d\'ailleurs');
    }

    /** @return array<string, mixed> */
    private function arbre(): array
    {
        return $this->getJson('/api/agency/document-vault')->assertOk()->json('data');
    }

    /** @return array<string, mixed> la réponse entière de la liste de l'agence */
    private function liste(array $filtre = [], array $extra = []): array
    {
        return $this->getJson('/api/documents?'.http_build_query(['filter' => ['agency' => 'current'] + $filtre, 'per_page' => 100] + $extra))->assertOk()->json();
    }

    /** @return array<string, array<string, mixed>> les dossiers d'un nœud, par clé */
    private function dossiers(array $noeud): array
    {
        return collect($noeud['folders'])->keyBy('key')->all();
    }

    /** @return array<string, mixed> */
    private function noeudDuBail(array $arbre, Lease $lease): array
    {
        foreach ($arbre['properties'] as $property) {
            foreach ($property['leases'] as $node) {
                if ($node['id'] === $lease->id) {
                    return $node;
                }
            }
        }
        $this->fail("Bail {$lease->id} absent de l'arbre");
    }

    /** AC1 — le bail découpé en Contrat 1, États des lieux 1, Quittances 6, Pièces du locataire 3 (1 expire, 1 à vérifier). */
    public function test_ac1_l_admin_lit_le_bail_decoupe_en_dossiers_comptes(): void
    {
        $this->connecter($this->admin);
        $arbre = $this->arbre();

        $villa = collect($arbre['properties'])->firstWhere('id', $this->property->id);
        $this->assertSame('Villa Almadies', $villa['title']);
        $this->assertSame('Almadies', $villa['neighborhood']);
        $this->assertSame(['property_pieces'], array_keys($this->dossiers($villa)));
        $this->assertSame(1, $this->dossiers($villa)['property_pieces']['documents']);

        $bail = $this->noeudDuBail($arbre, $this->lease);
        $this->assertSame($this->lease->reference_number, $bail['reference_number']);
        $this->assertSame('Awa Niang', $bail['tenant']['name']);
        $this->assertSame($this->lease->start_date->format('Y-m-d'), $bail['start_date']);

        $dossiers = $this->dossiers($bail);
        $this->assertSame(['contract', 'inventories', 'receipts', 'tenant_pieces'], array_keys($dossiers));
        $this->assertSame(1, $dossiers['contract']['documents']);
        $this->assertSame(1, $dossiers['inventories']['documents']);
        $this->assertSame(6, $dossiers['receipts']['documents']);
        $this->assertSame(3, $dossiers['tenant_pieces']['documents']);
        $this->assertSame(1, $dossiers['tenant_pieces']['expiring_soon']);
        $this->assertSame(1, $dossiers['tenant_pieces']['unverified']);
        $this->assertSame(Document::today()->addDays(42)->toDateString(), $dossiers['tenant_pieces']['next_expiry_date']);
        $this->assertSame(['type' => 'lease', 'id' => $this->lease->id], $dossiers['tenant_pieces']['target']);
        foreach (['contract', 'inventories', 'receipts'] as $genere) {
            $this->assertSame('generated', $dossiers[$genere]['kind']);
            $this->assertSame(0, $dossiers[$genere]['expiring_soon'] + $dossiers[$genere]['unverified']);
        }
        $this->assertSame(11, $bail['documents']);
        $this->assertSame(1, $bail['expiring_soon']);
        $this->assertSame(1, $bail['unverified']);

        // Le brouillon n'a pas de nœud ; le dossier de l'agence porte son NINEA.
        $this->assertNotContains($this->draftLease->id, collect($arbre['properties'])->flatMap(fn ($p) => array_column($p['leases'], 'id'))->all());
        $this->assertSame(['type' => 'agency', 'id' => $this->agency->id], $arbre['agency_folder']['target']);
        $this->assertSame(1, $arbre['agency_folder']['documents']);
        $this->assertSame(1, $arbre['agency_folder']['unverified']);
    }

    /** AC2 — rien d'une autre agence ni de ce qu'un `show` refuse, dans l'arbre comme dans la liste ; parité liste ↔ `show`. */
    public function test_ac2_parite_de_la_liste_de_l_agence_avec_le_show(): void
    {
        foreach ([$this->admin, $this->agent] as $who) {
            $this->connecter($who);
            $arbre = $this->arbre();
            $this->assertNotContains($this->foreignProperty->id, array_column($arbre['properties'], 'id'));

            $listed = array_column($this->liste()['data'], 'id');
            $this->assertNotContains($this->foreignDoc->id, $listed);
            $this->assertNotContains($this->draftLeaseDoc->id, $listed);
            foreach ($listed as $id) {
                $this->getJson("/api/documents/{$id}")->assertOk();
            }
            $this->getJson("/api/documents/{$this->foreignDoc->id}")->assertForbidden();

            // Tout document d'un bien, d'un bail hors brouillon ou de l'agence que `show` ouvre est listé.
            $dansLaPortee = Document::query()->where(fn ($q) => $q
                ->whereIn('documentable_type', [Property::class, Agency::class])
                ->orWhere(fn ($l) => $l->where('documentable_type', Lease::class)->where('documentable_id', '!=', $this->draftLease->id)))
                ->pluck('id');
            foreach ($dansLaPortee as $id) {
                $ouvert = $this->getJson("/api/documents/{$id}")->status() === 200;
                $this->assertSame($ouvert, in_array($id, $listed, true), "document {$id}");
            }
        }
    }

    /** AC3 — les totaux égalent la somme des dossiers, et les téléversés de l'arbre la méta de la liste. */
    public function test_ac3_les_totaux_egalent_les_dossiers_et_la_liste(): void
    {
        $this->connecter($this->agent);
        $arbre = $this->arbre();

        $dossiers = collect($arbre['properties'])->flatMap(fn ($p) => [...$p['folders'], ...collect($p['leases'])->flatMap(fn ($l) => $l['folders'])->all()])
            ->push($arbre['agency_folder']);
        foreach (['documents', 'expiring_soon', 'unverified'] as $cle) {
            $this->assertSame($dossiers->sum($cle), $arbre['totals'][$cle], $cle);
        }

        $liste = $this->liste();
        $televerses = $dossiers->where('kind', 'uploaded');
        $this->assertSame($televerses->sum('documents'), $liste['meta']['total']);
        $this->assertSame($televerses->sum('expiring_soon'), $liste['meta']['expiring_soon']);
        $this->assertSame($televerses->sum('unverified'), $liste['meta']['unverified']);
        $this->assertSame($dossiers->where('kind', 'generated')->sum('documents'), $liste['meta']['generated']);
        $this->assertSame(Document::today()->addDays(42)->toDateString(), $arbre['totals']['next_expiry_date']);

        // Un dossier se lit par la liste, combinée à sa cible.
        $pieces = $this->liste(['documentable_type' => 'lease', 'documentable_id' => (string) $this->lease->id]);
        $this->assertEqualsCanonicalizing([$this->adminDocOnLease->id, $this->expiring->id, $this->unverified->id], array_column($pieces['data'], 'id'));
    }

    /** AC4 — chercher « Niang » rend les pièces du bail de Niang, dont le nom ne le contient pas. */
    public function test_ac4_la_recherche_trouve_le_locataire_et_le_bien(): void
    {
        $this->waitForMeilisearch();
        $this->connecter($this->agent);

        $ids = array_column($this->liste(['search' => 'Niang'])['data'], 'id');
        $this->assertEqualsCanonicalizing([$this->adminDocOnLease->id, $this->expiring->id, $this->unverified->id], $ids);

        $plateau = array_column($this->liste(['search' => 'Plateau'])['data'], 'id');
        $this->assertSame([$this->adminDocOnOtherLease->id], $plateau);

        // Le nom du locataire change : l'index suit (DocumentsDuPorteurObserver).
        Customer::query()->whereKey($this->lease->tenant_id)->sole()->update(['last_name' => 'Diouf']);
        $this->waitForMeilisearch();
        $this->assertSame([], array_column($this->liste(['search' => 'Niang'])['data'], 'id'));

        // Les générés se cherchent aussi par le locataire.
        $generes = $this->liste(['generated' => '1', 'search' => 'Sarr'])['data'];
        $this->assertEqualsCanonicalizing(["/api/leases/{$this->otherLease->id}/receipts/{$this->otherTenantPayment->id}/pdf", "/api/leases/{$this->otherLease->id}/contract/pdf"], array_column($generes, 'download_path'));
    }

    /** AC5 — `filter[generated]=1` ne rend que des générés, chacun ouvert par son endpoint. */
    public function test_ac5_les_generes_de_l_agence_s_ouvrent_tous(): void
    {
        $this->connecter($this->agent);
        $reponse = $this->liste(['generated' => '1']);

        // 2 contrats, 1 état des lieux signé, 6 + 1 quittances.
        $this->assertSame(10, $reponse['meta']['total']);
        $this->assertSame(10, $reponse['meta']['generated']);
        foreach ($reponse['data'] as $entree) {
            $this->assertSame('generated', $entree['kind']);
            $this->assertMatchesRegularExpression('/^(lease_contract|inventory_.+|receipt_.+)$/', $entree['category']);
            $this->assertSame(200, $this->get($entree['download_path'])->getStatusCode(), $entree['download_path']);
        }
        $contrat = collect($reponse['data'])->firstWhere('download_path', "/api/leases/{$this->lease->id}/contract/pdf");
        $this->assertSame(['id' => $this->property->id, 'title' => 'Villa Almadies', 'neighborhood' => 'Almadies'], $contrat['context']['property']);
        $this->assertSame('Awa Niang', $contrat['context']['lease']['tenant_name']);

        // Paginé par le serveur.
        $page2 = $this->getJson('/api/documents?filter[agency]=current&filter[generated]=1&per_page=4&page=3')->assertOk()->json();
        $this->assertCount(2, $page2['data']);
        $this->assertSame(10, $page2['meta']['total']);

        // Sans la cible agence, rien.
        $this->assertSame([], $this->getJson('/api/documents?filter[generated]=1')->assertOk()->json('data'));
    }

    /** AC6 — la fiche d'une pièce de bail porte le bien, son quartier, le bail et le locataire ; celle d'une pièce de bien, le bien seul. */
    public function test_ac6_le_contexte_de_la_fiche(): void
    {
        $this->connecter($this->agent);

        $this->getJson("/api/documents/{$this->expiring->id}")->assertOk()
            ->assertJsonPath('data.context.property', ['id' => $this->property->id, 'title' => 'Villa Almadies', 'neighborhood' => 'Almadies'])
            ->assertJsonPath('data.context.lease', ['id' => $this->lease->id, 'reference_number' => $this->lease->reference_number, 'tenant_name' => 'Awa Niang']);
        $this->getJson("/api/documents/{$this->adminDocOnProperty->id}")->assertOk()
            ->assertJsonPath('data.context.property.title', 'Villa Almadies')
            ->assertJsonPath('data.context.lease', null);
        $this->getJson("/api/documents/{$this->ninea->id}")->assertOk()->assertJsonPath('data.context', null);

        // Jamais sur une liste.
        foreach ($this->liste()['data'] as $ligne) {
            $this->assertArrayNotHasKey('context', $ligne);
        }

        // Le locataire lit le contexte de sa pièce de bail.
        $this->connecter($this->tenant);
        $this->getJson("/api/documents/{$this->expiring->id}")->assertOk()->assertJsonPath('data.context.lease.tenant_name', 'Awa Niang');

        // Le téléverseur qui ne lit pas le bail (un autre bailleur de l'agence, ouvert par la règle
        // d'auteur) ouvre sa pièce, sans en apprendre le bien, le bail ni le locataire.
        $autreBailleur = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $autreBailleur->id, 'agency_id' => $this->agency->id]);
        $sienne = $this->document($this->lease, $autreBailleur, DocumentType::Other, 'Pièce de l\'autre bailleur');
        $this->connecter($autreBailleur);
        $this->getJson("/api/documents/{$sienne->id}")->assertOk()->assertJsonPath('data.context', null);
    }

    /** AC7 — 30 biens et 40 baux se lisent en autant de requêtes qu'un bien et un bail. */
    public function test_ac7_le_nombre_de_requetes_ne_depend_pas_du_parc(): void
    {
        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $landlord = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $landlord->id, 'agency_id' => $agency->id]);

        $bail = function (Property $property): Lease {
            $lease = $this->leaseFor(User::factory()->create(), $property, LeaseStatus::Active);
            $this->payment($lease, LeasePaymentType::Rent, PaymentStatus::Paid, '2026-02-05');
            $this->document($lease, User::factory()->create(), DocumentType::Other, 'Pièce');

            return $lease;
        };
        $bien = fn () => Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $landlord->id]);

        $bail($bien());
        $this->connecter($admin);
        $un = $this->requetes(fn () => $this->getJson('/api/agency/document-vault')->assertOk());

        $biens = collect(range(1, 29))->map(fn () => $bien());
        foreach (range(1, 39) as $i) {
            $bail($biens[$i % 29]);
        }
        $this->connecter($admin);
        $arbre = $this->getJson('/api/agency/document-vault')->assertOk()->json('data');
        $this->assertCount(30, $arbre['properties']);
        $this->assertSame(40, collect($arbre['properties'])->sum(fn ($p) => count($p['leases'])));
        $this->connecter($admin);
        $this->assertSame($un, $this->requetes(fn () => $this->getJson('/api/agency/document-vault')->assertOk()));
    }

    /** AC8 — le locataire, le bailleur, le prestataire, le super-admin et l'agent retiré : 403, et une liste d'agence vide. */
    public function test_ac8_hors_du_personnel_actif_403(): void
    {
        $retire = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $retire->id, 'agency_id' => $this->agency->id, 'status' => AgentProfileStatus::Suspended]);
        $provider = $this->providerFor($this->agency);

        $cas = [
            'locataire' => [$this->tenant, null],
            'bailleur' => [$this->landlord, OwnerProfile::query()->where('user_id', $this->landlord->id)->sole()],
            'prestataire' => [$provider, ServiceProviderProfile::query()->where('user_id', $provider->id)->sole()],
            'agent retiré' => [$retire, null],
        ];
        foreach ($cas as $qui => [$user, $profil]) {
            $this->connecter($user, $profil);
            $this->getJson('/api/agency/document-vault')->assertForbidden();
            $this->assertSame([], $this->liste()['data'], $qui);
            $this->assertSame([], $this->liste(['generated' => '1'])['data'], $qui);
        }

        $this->commeOperateur($this->operateur(PlatformProfileLevel::SuperAdmin));
        $this->getJson('/api/agency/document-vault')->assertForbidden();

        // Une autre valeur que `current` ne rend rien, même au personnel.
        $this->connecter($this->agent);
        $this->assertSame([], $this->getJson("/api/documents?filter[agency]={$this->agency->id}")->assertOk()->json('data'));
    }

    /** Le membre de deux agences lit celle de son profil actif, jamais l'autre. */
    public function test_le_membre_de_deux_agences_lit_celle_de_son_profil_actif(): void
    {
        $autre = Agency::factory()->create();
        $profilAutre = AgentProfile::query()->create(['user_id' => $this->agent->id, 'agency_id' => $autre->id]);
        $bienAutre = Property::factory()->create(['agency_id' => $autre->id, 'title' => 'Immeuble Mermoz']);
        $pieceAutre = $this->document($bienAutre, $this->agent, DocumentType::Other, 'Pièce de Mermoz');

        $this->connecter($this->agent, $profilAutre);
        $this->assertSame([$bienAutre->id], array_column($this->arbre()['properties'], 'id'));
        $this->assertSame([$pieceAutre->id], array_column($this->liste()['data'], 'id'));

        $this->connecter($this->agent, AgentProfile::query()->where('user_id', $this->agent->id)->where('agency_id', $this->agency->id)->sole());
        $this->assertNotContains($bienAutre->id, array_column($this->arbre()['properties'], 'id'));
        $this->assertNotContains($pieceAutre->id, array_column($this->liste()['data'], 'id'));
    }

    /** Sous impersonation de l'agent : l'arbre se lit, et la liste reste ce que `show` ouvre. */
    public function test_sous_impersonation_la_liste_suit_le_show(): void
    {
        $session = $this->ouvrirUneSession(cible: $this->agent);
        $this->avecLeJeton($session['jeton']);

        $this->getJson('/api/agency/document-vault')->assertOk();
        $listed = array_column($this->liste()['data'], 'id');
        $this->assertNotEmpty($listed);
        foreach ($listed as $id) {
            $this->getJson("/api/documents/{$id}")->assertOk();
        }
    }
}
