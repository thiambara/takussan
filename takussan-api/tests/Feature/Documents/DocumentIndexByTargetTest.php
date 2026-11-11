<?php

namespace Tests\Feature\Documents;

use App\Models\Agency;
use App\Models\Enums\DocumentType;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\CoffreDeDocuments;
use Tests\TestCase;

/**
 * TCK-2655 (ADR-0099 §1) — `GET /api/documents` AVEC une cible (`filter[documentable_type]` +
 * `filter[documentable_id]`) rend tout ce que `view` ouvre sur cette cible, quel qu'en soit l'auteur ;
 * SANS cible, la règle de TCK-820 (ses propres téléversements) reste entière.
 */
class DocumentIndexByTargetTest extends TestCase
{
    use CoffreDeDocuments;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->batirLeCoffre();
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        return $this->getJson('/api/documents'.$query)->assertOk()->json('data.*.id');
    }

    /** AC3 — l'agent de l'agence lit les documents du bail de tous les auteurs. */
    public function test_ac3_the_agency_agent_lists_the_lease_documents_of_all_authors(): void
    {
        $tenantUpload = $this->document($this->lease, $this->tenant, DocumentType::Other, 'Attestation employeur');

        $this->connecter($this->agent);
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $tenantUpload->id],
            $this->ids("?filter[documentable_type]=lease&filter[documentable_id]={$this->lease->id}"),
        );
        // Le nom de classe complet vaut l'alias.
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $tenantUpload->id],
            $this->ids('?filter[documentable_type]='.urlencode(Lease::class)."&filter[documentable_id]={$this->lease->id}"),
        );
        $this->assertSame(
            [$this->adminDocOnProperty->id],
            $this->ids("?filter[documentable_type]=property&filter[documentable_id]={$this->property->id}"),
        );

        // Le locataire lit lui aussi les documents de son bail, de tous les auteurs.
        $this->connecter($this->tenant);
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $tenantUpload->id],
            $this->ids("?filter[documentable_type]=lease&filter[documentable_id]={$this->lease->id}"),
        );
    }

    /** La liste par cible suit la lecture : chaque document rendu s'ouvre pour l'appelant. */
    public function test_every_listed_document_of_a_target_opens(): void
    {
        $this->document($this->lease, $this->tenant, DocumentType::Other, 'Attestation employeur');

        foreach ([$this->agent, $this->tenant, $this->landlord, $this->otherTenant] as $who) {
            $this->connecter($who);
            foreach (['lease' => $this->lease->id, 'property' => $this->property->id, 'user' => $this->tenant->id] as $type => $id) {
                foreach ($this->ids("?filter[documentable_type]={$type}&filter[documentable_id]={$id}") as $docId) {
                    $this->getJson("/api/documents/{$docId}")->assertOk();
                }
            }
        }
    }

    /** AC3 — l'agent d'une autre agence ne lit rien, sans 403 ni 404 qui dirait que la cible existe. */
    public function test_ac3_an_agent_of_another_agency_lists_nothing(): void
    {
        $stranger = User::factory()->create();
        AgentProfile::query()->create(['user_id' => $stranger->id, 'agency_id' => Agency::factory()->create()->id]);

        $this->connecter($stranger);
        $this->assertSame([], $this->ids("?filter[documentable_type]=lease&filter[documentable_id]={$this->lease->id}"));
        $this->assertSame([], $this->ids('?filter[documentable_type]=lease&filter[documentable_id]=999999999'));
        $this->getJson("/api/documents/{$this->adminDocOnLease->id}")->assertForbidden();
    }

    /**
     * Une cible illisible retombe sur la règle d'auteur, comme `view` : le téléversement de
     * l'appelant sur un bien sans agence reste listé ; sur un bien d'agence dont il n'est pas membre,
     * `view` le refuse, la liste aussi.
     */
    public function test_an_unreadable_target_falls_back_on_the_author_rule(): void
    {
        $this->connecter($this->tenant);
        $this->assertSame([], $this->ids("?filter[documentable_type]=property&filter[documentable_id]={$this->property->id}"));

        $outside = $this->document($this->property, $this->tenant, DocumentType::Photo, 'Photo de la fuite');
        $this->assertSame([], $this->ids("?filter[documentable_type]=property&filter[documentable_id]={$this->property->id}"));
        $this->getJson("/api/documents/{$outside->id}")->assertForbidden();

        $loose = Property::factory()->create(['agency_id' => null, 'user_id' => User::factory()->create()->id]);
        $mine = $this->document($loose, $this->tenant, DocumentType::Photo, 'Photo du compteur');
        $this->assertSame([$mine->id], $this->ids("?filter[documentable_type]=property&filter[documentable_id]={$loose->id}"));
        $this->getJson("/api/documents/{$mine->id}")->assertOk();
    }

    /** AC4 — sans cible, les seuls téléversements de l'appelant (TCK-820). */
    public function test_ac4_without_a_target_only_the_callers_uploads(): void
    {
        $this->connecter($this->agent);
        $this->assertSame([], $this->ids(''));
        $this->assertSame([], $this->ids('?filter[documentable_type]=lease'));

        $this->connecter($this->admin);
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $this->adminDocOnOtherLease->id, $this->adminDocOnProperty->id],
            $this->ids(''),
        );
        // Le type seul filtre la règle d'auteur, il ne l'élargit pas.
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $this->adminDocOnOtherLease->id],
            $this->ids('?filter[documentable_type]=lease'),
        );
    }

    /** Les formes inattendues ne rendent jamais 500, et un type inconnu ne rend rien. */
    public function test_malformed_filters_never_fail(): void
    {
        $this->connecter($this->admin);

        $this->assertSame([], $this->ids('?filter[documentable_type]=bogus'));
        $this->assertSame([], $this->ids("?filter[documentable_type]=bogus&filter[documentable_id]={$this->lease->id}"));
        $this->getJson('/api/documents?filter[documentable_type][]=lease')->assertOk();
        $this->getJson("/api/documents?filter[documentable_type]=lease&filter[documentable_id][]={$this->lease->id}")->assertOk();
        // Un identifiant non entier : le 400 de `HasQueryBuilder` (colonne d'identifiant), pas une 500.
        $this->getJson('/api/documents?filter[documentable_type]=lease&filter[documentable_id]=abc')->assertStatus(400);
        // Une liste d'alias est un filtre de types (règle d'auteur), pas une cible.
        $this->assertEqualsCanonicalizing(
            [$this->adminDocOnLease->id, $this->adminDocOnOtherLease->id, $this->adminDocOnProperty->id],
            $this->ids('?filter[documentable_type]=lease,property'),
        );
    }

    /** Les pastilles de la liste filtrée : expire bientôt (≤ 60 jours) et à vérifier. */
    public function test_the_meta_carries_the_attention_counts(): void
    {
        $this->connecter($this->tenant);
        $meta = $this->getJson("/api/documents?filter[documentable_type]=user&filter[documentable_id]={$this->tenant->id}")->assertOk()->json('meta');

        $this->assertSame(1, $meta['expiring_soon']);
        $this->assertSame(2, $meta['unverified']);
        $this->assertSame(2, $meta['total']);

        // Sous un sparse fieldset, comme l'appelle le front : les colonnes choisies ne côtoient pas
        // l'agrégat (une 500 PostgreSQL avant correction).
        $sparse = $this->getJson("/api/documents?fields[documents]=id,name,type,expiry_date&filter[documentable_type]=user&filter[documentable_id]={$this->tenant->id}")->assertOk()->json('meta');
        $this->assertSame([1, 2], [$sparse['expiring_soon'], $sparse['unverified']]);
    }
}
