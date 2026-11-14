<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2841 (ADR-0099, amendement du 2026-11-14, « un bien et ses baux, en une lecture ») —
 * `GET /api/documents?filter[property_with_leases]={id}` : les pièces du bien ET de ses baux hors
 * brouillon, passés compris, chacune jugée par la lecture de SA cible (le bien, puis chaque bail).
 *
 * Le décor ajoute au bien du coffre un bail CLOS dont le bailleur était un autre (`ancienBailleur`,
 * bailleur de la même agence) et un bail en BROUILLON, chacun avec une pièce : c'est ce qui sépare
 * « lit le bien » de « lit chaque bail ».
 */
class DocumentsDuBienEtDeSesBauxTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    private User $ancienBailleur;

    private User $ancienLocataire;

    private Lease $bailClos;

    private Lease $brouillon;

    private Document $pieceDuBailClos;

    private Document $pieceDuBrouillon;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();

        $this->ancienBailleur = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $this->ancienBailleur->id, 'agency_id' => $this->agency->id]);
        $this->ancienLocataire = User::factory()->create();

        $this->bailClos = $this->leaseFor($this->ancienLocataire, $this->property, LeaseStatus::Expired);
        $this->bailClos->update(['landlord_id' => $this->ancienBailleur->id]);
        $this->brouillon = $this->leaseFor(User::factory()->create(), $this->property, LeaseStatus::Draft);

        $this->pieceDuBailClos = $this->document($this->bailClos, $this->admin, DocumentType::LeaseContract, 'Contrat scanné de 2024');
        $this->pieceDuBrouillon = $this->document($this->brouillon, $this->admin, DocumentType::Other, 'Pièce du brouillon');
    }

    private function url(mixed $id = null, string $suite = ''): string
    {
        return '/api/documents?filter[property_with_leases]='.($id ?? $this->property->id).$suite;
    }

    /** @return list<int> */
    private function ids(mixed $id = null, string $suite = ''): array
    {
        return $this->getJson($this->url($id, $suite))->assertOk()->json('data.*.id');
    }

    private function agentDAilleurs(): User
    {
        $stranger = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $stranger->id, 'agency_id' => Agency::factory()->create()->id]);

        return $stranger;
    }

    /** AC1 — l'agent de l'agence lit les pièces du bien et des deux baux, chacune nommée avec son bail. */
    public function test_ac1_l_agent_lit_le_bien_et_ses_deux_baux_chaque_piece_avec_son_bail(): void
    {
        $this->connecter($this->agent);
        $data = collect($this->getJson($this->url())->assertOk()->json('data'))->keyBy('id');

        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnProperty->id, $this->adminDocOnLease->id, $this->pieceDuBailClos->id],
            $data->keys()->all(),
        );
        $this->assertSame(
            ['id' => $this->bailClos->id, 'reference_number' => $this->bailClos->reference_number, 'status' => 'expired'],
            $data[$this->pieceDuBailClos->id]['lease'],
        );
        $this->assertSame($this->lease->id, $data[$this->adminDocOnLease->id]['lease']['id']);
        $this->assertSame('active', $data[$this->adminDocOnLease->id]['lease']['status']);
        $this->assertArrayNotHasKey('lease', $data[$this->adminDocOnProperty->id]);
        $this->assertSame(3, $this->getJson($this->url())->json('meta.total'));
    }

    /** AC2 — l'agent d'une autre agence : rien, sans 403 ni 404 qui dirait que le bien existe. */
    public function test_ac2_l_agent_d_une_autre_agence_ne_lit_rien(): void
    {
        $this->connecter($this->agentDAilleurs());
        $this->assertSame([], $this->ids());
    }

    /** AC2 — le locataire du bail en cours : ni les pièces du bien, ni celles du bail clos ; les siennes. */
    public function test_ac2_le_locataire_en_cours_ne_lit_que_son_bail(): void
    {
        $this->connecter($this->tenant);
        $this->assertSame([$this->adminDocOnLease->id], $this->ids());

        $this->connecter($this->ancienLocataire);
        $this->assertSame([$this->pieceDuBailClos->id], $this->ids());
    }

    /**
     * La lecture se juge bail par bail, pas par le bien : le bailleur du bien ne lit pas le bail clos
     * signé par son prédécesseur, et le prédécesseur ne lit que ce bail-là.
     */
    public function test_le_view_se_juge_sur_chaque_bail_pas_sur_le_bien(): void
    {
        $this->connecter($this->landlord);
        $this->assertEqualsCanonicalizing([$this->adminDocOnProperty->id, $this->adminDocOnLease->id], $this->ids());
        $this->getJson("/api/documents/{$this->pieceDuBailClos->id}")->assertForbidden();

        $this->connecter($this->ancienBailleur);
        $this->assertSame([$this->pieceDuBailClos->id], $this->ids());
    }

    /** AC3 — un bail en brouillon n'y range rien, même pour qui le lit. */
    public function test_ac3_un_brouillon_n_y_range_rien(): void
    {
        foreach ([$this->agent, $this->admin] as $who) {
            $this->connecter($who);
            $this->getJson("/api/documents/{$this->pieceDuBrouillon->id}")->assertOk();
            $this->assertNotContains($this->pieceDuBrouillon->id, $this->ids());
        }
    }

    /** L'arbre est borné au bien : les pièces d'un bail d'un autre bien de l'agence n'y entrent pas. */
    public function test_les_baux_d_un_autre_bien_n_y_entrent_pas(): void
    {
        $this->connecter($this->agent);
        $this->assertNotContains($this->adminDocOnOtherLease->id, $this->ids());
        $this->assertSame([$this->adminDocOnOtherLease->id], $this->ids($this->otherProperty->id));
    }

    /**
     * La liste suit la lecture, dans les deux sens, par persona : chaque pièce listée s'ouvre, et chaque
     * pièce de l'arbre (hors brouillon) qui s'ouvre est listée.
     */
    public function test_parite_entre_la_liste_et_le_show(): void
    {
        $arbre = Document::query()
            ->where(fn ($q) => $q->where('documentable_type', $this->property::class)->where('documentable_id', $this->property->id))
            ->orWhere(fn ($q) => $q->where('documentable_type', Lease::class)->whereIn('documentable_id', [$this->lease->id, $this->bailClos->id]))
            ->pluck('id')->all();
        $this->assertCount(3, $arbre);

        foreach ([$this->agent, $this->admin, $this->landlord, $this->ancienBailleur, $this->tenant, $this->ancienLocataire, $this->otherTenant, $this->agentDAilleurs()] as $who) {
            $this->connecter($who);
            $listes = $this->ids();
            $ouverts = array_values(array_filter($arbre, fn (int $id): bool => $this->getJson("/api/documents/{$id}")->status() === 200));
            $this->assertEqualsCanonicalizing($ouverts, $listes, "Persona {$who->id}");
        }
    }

    /**
     * Une cible illisible retombe sur la règle d'auteur, comme le § 1 : le locataire voit sa pièce
     * déposée sur le bien seulement si `view` la lui ouvre.
     */
    public function test_une_cible_illisible_retombe_sur_la_regle_d_auteur(): void
    {
        $sienne = $this->document($this->bailClos, $this->tenant, DocumentType::Other, 'Pièce d\'un tiers');
        $this->connecter($this->tenant);
        $this->assertSame([$this->adminDocOnLease->id], $this->ids());
        $this->getJson("/api/documents/{$sienne->id}")->assertForbidden();
    }

    /** Un identifiant mal formé, inconnu ou en liste : rien, jamais 500, jamais les téléversements de l'appelant. */
    public function test_un_identifiant_illisible_ne_rend_rien(): void
    {
        $this->connecter($this->admin);
        $this->assertNotSame([], $this->getJson('/api/documents')->assertOk()->json('data')); // l'admin a des téléversements…
        foreach (['abc', '999999999', '1.5', '-1', ''] as $id) {
            $this->assertSame([], $this->ids($id), "id={$id}"); // … qui ne remontent pas ici.
        }
        $this->getJson('/api/documents?filter[property_with_leases][]='.$this->property->id)->assertOk()->assertJsonCount(0, 'data');
    }

    /** Les autres filtres se combinent : `documentable_type=lease` n'y rend que les pièces des baux. */
    public function test_les_autres_filtres_se_combinent(): void
    {
        $this->connecter($this->agent);
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $this->pieceDuBailClos->id],
            $this->ids(null, '&filter[documentable_type]=lease'),
        );
    }

    /**
     * Le super-admin n'a pas de liste de plateforme (TCK-820) : dans l'arbre comme sur une cible
     * simple, la règle d'auteur, et l'arbre rend exactement l'union des listes de ses cibles.
     */
    public function test_le_super_admin_suit_la_regle_de_la_cible_simple(): void
    {
        $operateur = User::factory()->create();
        $this->materializeRoleProfile($operateur, 'super_admin');
        $this->document($this->bailClos, $operateur, DocumentType::Other, 'Pièce de l\'opérateur');
        $this->document($this->property, $operateur, DocumentType::Other, 'Autre pièce de l\'opérateur');

        $this->connecter($operateur);
        $union = [];
        foreach ([['property', $this->property->id], ['lease', $this->lease->id], ['lease', $this->bailClos->id]] as [$type, $id]) {
            $union = [...$union, ...$this->getJson("/api/documents?filter[documentable_type]={$type}&filter[documentable_id]={$id}")->assertOk()->json('data.*.id')];
        }
        $this->assertEqualsCanonicalizing($union, $this->ids());
        $this->assertNotContains($this->adminDocOnProperty->id, $this->ids());
    }

    /**
     * La couture avec l'onglet (`useDocuments({ property_with_leases })`) : la requête telle que le front
     * l'envoie, `fields[documents]` de la liste compris, rend les mêmes lignes et leur `lease`.
     */
    public function test_la_requete_du_front_rend_les_pieces_et_leur_bail(): void
    {
        // `DOCUMENT_LIST_FIELDS` (takussan-web/src/lib/queries/documents.ts).
        $fields = 'id,name,type,description,documentable_type,documentable_id,is_verified,expiry_date,uploaded_by,is_internal,created_at';
        $this->connecter($this->agent);
        $data = collect($this->getJson($this->url(null, "&fields[documents]={$fields}&sort=-created_at&page=1&per_page=100"))
            ->assertOk()->json('data'))->keyBy('id');

        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnProperty->id, $this->adminDocOnLease->id, $this->pieceDuBailClos->id],
            $data->keys()->all(),
        );
        $this->assertSame($this->bailClos->id, $data[$this->pieceDuBailClos->id]['lease']['id']);
        $this->assertSame('expired', $data[$this->pieceDuBailClos->id]['lease']['status']);
    }

    /**
     * Le cœur de l'amendement (décision de team-lead du 2026-11-14) : entre locataires successifs d'un même
     * bien, AUCUNE pièce ne passe — ni celles que l'agence a déposées sur l'autre bail, ni celles que
     * l'autre locataire y a déposées lui-même —, y compris quand le locataire en cours a un accès au bien
     * (il en devient le bailleur, ou il est bailleur d'un autre bien de l'agence). Un agent d'une autre
     * agence et le bailleur d'un autre bien ne lisent rien.
     */
    public function test_les_locataires_successifs_ne_se_lisent_pas_meme_avec_un_acces_au_bien(): void
    {
        $proprietaire = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $proprietaire->id, 'agency_id' => $this->agency->id]);
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $proprietaire->id]);
        $ancien = User::factory()->create();
        $actuel = User::factory()->create();
        $bailAncien = $this->leaseFor($ancien, $bien, LeaseStatus::Terminated);
        $bailActuel = $this->leaseFor($actuel, $bien, LeaseStatus::Active);

        $pieceDuBien = $this->document($bien, $this->admin, DocumentType::Insurance, 'Assurance');
        $ancienAgence = $this->document($bailAncien, $this->admin, DocumentType::LeaseContract, 'Contrat de l\'ancien');
        $ancienSienne = $this->document($bailAncien, $ancien, DocumentType::IdCard, 'CNI de l\'ancien');
        $actuelAgence = $this->document($bailActuel, $this->admin, DocumentType::LeaseContract, 'Contrat de l\'actuel');
        $actuelSienne = $this->document($bailActuel, $actuel, DocumentType::IdCard, 'CNI de l\'actuel');
        // Un bail du locataire en cours sur un AUTRE bien : il le lit, mais il n'est pas de cet arbre.
        $ailleurs = $this->document($this->leaseFor($actuel, $this->otherProperty, LeaseStatus::Expired), $this->admin, DocumentType::Other, 'Bail d\'avant, ailleurs');

        $lit = function (User $who) use ($bien): array {
            $this->connecter($who);

            return $this->ids($bien->id);
        };

        $this->connecter($actuel);
        $this->getJson("/api/documents/{$ailleurs->id}")->assertOk();

        // Sans accès au bien : chacun son bail, rien d'autre.
        $this->assertEqualsCanonicalizing([$actuelAgence->id, $actuelSienne->id], $lit($actuel));
        $this->assertEqualsCanonicalizing([$ancienAgence->id, $ancienSienne->id], $lit($ancien));

        // Le locataire en cours, bailleur d'un AUTRE bien de l'agence (profil propriétaire : la règle
        // d'auteur s'élargit pour lui) : toujours rien du bail de l'ancien.
        OwnerProfile::query()->create(['user_id' => $actuel->id, 'agency_id' => $this->agency->id]);
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $actuel->id]);
        $this->assertEqualsCanonicalizing([$actuelAgence->id, $actuelSienne->id], $lit($actuel));

        // Le locataire en cours devient le bailleur du BIEN (il lit le bien) : toujours rien du bail de
        // l'ancien, signé par l'ancien propriétaire.
        $bien->update(['user_id' => $actuel->id]);
        $this->assertEqualsCanonicalizing([$pieceDuBien->id, $actuelAgence->id, $actuelSienne->id], $lit($actuel));
        foreach ([$ancienAgence, $ancienSienne] as $piece) {
            $this->getJson("/api/documents/{$piece->id}")->assertForbidden();
        }

        // Réciproquement, l'ancien locataire ne lit rien du bail en cours ni du bien.
        $this->assertEqualsCanonicalizing([$ancienAgence->id, $ancienSienne->id], $lit($ancien));

        // Un agent d'une autre agence, le bailleur d'un autre bien de l'agence : rien.
        $this->assertSame([], $lit($this->agentDAilleurs()));
        $voisin = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $voisin->id, 'agency_id' => $this->agency->id]);
        Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $voisin->id]);
        $this->assertSame([], $lit($voisin));
    }

    /**
     * AC5 — le même nombre de requêtes pour 2 baux ou 9 (même relevé que TCK-2655), pour le personnel, le
     * bailleur du bien (branche `BailleurDuBien`, amorcée) et le locataire (branche du locataire, lu avec
     * les baux).
     */
    public function test_ac5_nombre_de_requetes_constant_de_1_a_9_baux(): void
    {
        $appelants = ['agent' => $this->agent, 'bailleur' => $this->landlord, 'locataire' => $this->tenant];
        $avant = [];
        foreach ($appelants as $nom => $who) {
            $this->connecter($who);
            $this->getJson($this->url())->assertOk();
            $avant[$nom] = $this->requetes(fn () => $this->getJson($this->url())->assertOk());
        }

        foreach (range(1, 7) as $_) {
            $bail = $this->leaseFor(User::factory()->create(), $this->property, LeaseStatus::Expired);
            $this->document($bail, $this->admin, DocumentType::Other, 'Pièce');
        }

        foreach ($appelants as $nom => $who) {
            $this->connecter($who);
            $this->getJson($this->url())->assertOk();
            $this->assertSame($avant[$nom], $this->requetes(fn () => $this->getJson($this->url())->assertOk()), $nom);
        }
        $this->connecter($this->agent);
        $this->assertCount(3 + 7, $this->ids());
    }
}
