<?php

namespace Tests\Feature\Property;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\Support\FabriqueOccupation;

/**
 * TCK-2638 (lot B) — le mode Annonces de la liste des biens : ses pastilles « En ligne », « À valider »,
 * « Brouillons », « Hors ligne » sont une PARTITION du portefeuille (décision du porteur, 2 a), servie
 * par `filter[listing]` ({@see Property::scopeListingState()}) et comptée par `portfolio-summary` en
 * un appel — plus aucune liste `per_page=1` de comptage. « En ligne » est {@see Property::scopePublic()},
 * « Hors ligne » sa NÉGATION (jamais une copie, ADR-0097 § 1) moins les brouillons et les biens à valider.
 *
 * Chaque compte égale le `meta.total` de la liste qu'ouvre sa pastille, sous la portée du lecteur : le
 * bailleur ne compte que ses biens, l'agent sous « mes biens » les siens. Les onglets du bureau
 * « Vendus, loués » et « Archivés » aussi — « Archivés » se compte hors de la portée qui les exclut.
 */
class EtatDAnnonceTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use FabriqueDemandesEtVisites;
    use FabriqueOccupation;
    use RefreshDatabase;

    private const EN_LIGNE = ['visibility' => 'public', 'published_at' => '2026-10-01 10:00:00'];

    /** La pastille → la liste qu'elle ouvre. */
    private const PASTILLES = [
        'online' => '&filter[listing]=online',
        'pending_validation' => '&filter[listing]=pending',
        'drafts' => '&filter[listing]=draft',
        'offline' => '&filter[listing]=offline',
        'sold_or_rented' => '&filter[status]=sold,rented',
        'archived' => '&include_archived=1&filter[status]=archived',
    ];

    private Agency $agency;

    private User $admin;

    private User $agent;

    private User $owner;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->travelTo('2026-11-11 10:00:00');
        $this->agency = $this->agence();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->agent = $this->personnel($this->agency);
        $this->owner = $this->bailleur($this->agency);
        $autre = $this->bailleur($this->agency);

        // Du bailleur : en ligne ×2, en attente (`pending`, non publié), en revue, brouillon, puis hors
        // ligne — privé validé, public sans date de publication, public mais bien de test (une copie de
        // la règle qui oublierait `is_test` le dirait en ligne), loué, vendu, refusé — et un archivé.
        $this->bienLoue($this->agency, $this->owner, 'En ligne', self::EN_LIGNE);
        $this->bienLoue($this->agency, $this->owner, 'En ligne validé', self::EN_LIGNE + ['status' => 'published']);
        $this->bienLoue($this->agency, $this->owner, 'En attente', ['status' => 'pending']);
        $this->bienLoue($this->agency, $this->owner, 'En revue', ['status' => 'pending_review']);
        $this->bienLoue($this->agency, $this->owner, 'Brouillon', ['status' => 'draft']);
        $this->bienLoue($this->agency, $this->owner, 'Privé validé', ['status' => 'published', 'published_at' => '2026-10-01 10:00:00']);
        $this->bienLoue($this->agency, $this->owner, 'Public sans date', ['visibility' => 'public']);
        $this->bienLoue($this->agency, $this->owner, 'Bien de test', self::EN_LIGNE + ['is_test' => true]);
        $this->bienLoue($this->agency, $this->owner, 'Loué', self::EN_LIGNE + ['status' => 'rented']);
        $this->bienLoue($this->agency, $this->owner, 'Vendu', self::EN_LIGNE + ['status' => 'sold', 'contract_type' => 'sale', 'rent_period' => null]);
        $this->bienLoue($this->agency, $this->owner, 'Refusé', ['status' => 'rejected']);
        $this->bienLoue($this->agency, $this->owner, 'Archivé', ['status' => 'archived']);

        // De l'agent (« mes biens ») : en ligne, brouillon, archivé.
        $this->bienLoue($this->agency, $this->agent, 'Agent en ligne', self::EN_LIGNE);
        $this->bienLoue($this->agency, $this->agent, 'Agent brouillon', ['status' => 'draft']);
        $this->bienLoue($this->agency, $this->agent, 'Agent archivé', ['status' => 'archived']);

        // D'un autre bailleur de l'agence : en ligne ; d'une autre agence : en ligne et brouillon.
        $this->bienLoue($this->agency, $autre, 'Autre bailleur', self::EN_LIGNE);
        $ailleurs = $this->agence();
        $this->bienLoue($ailleurs, $this->bailleur($ailleurs), 'Ailleurs en ligne', self::EN_LIGNE);
        $this->bienLoue($ailleurs, $this->bailleur($ailleurs), 'Ailleurs brouillon', ['status' => 'draft']);
    }

    /** @return array<string, mixed> */
    private function summary(User $user, string $query = ''): array
    {
        $this->actingAsApi($user);

        return $this->getJson('/api/properties/portfolio-summary?'.ltrim($query, '&'))->assertOk()->json('data');
    }

    /** @return list<string> */
    private function titres(User $user, string $query): array
    {
        $this->actingAsApi($user);
        $titres = array_column($this->getJson('/api/properties?per_page=100&fields[properties]=id,title'.$query)->assertOk()->json('data'), 'title');
        sort($titres);

        return $titres;
    }

    /** Chaque compte = le `meta.total` de la liste de sa pastille ; les quatre états = le total. */
    private function assertPastillesEgalesAuxListes(User $user, string $portee = ''): array
    {
        $summary = $this->summary($user, $portee);
        foreach (self::PASTILLES as $cle => $filtre) {
            $this->assertCount($summary[$cle], $this->titres($user, $portee.$filtre), "pastille {$cle}");
        }
        $this->assertSame(
            $summary['total'],
            $summary['online'] + $summary['pending_validation'] + $summary['drafts'] + $summary['offline'],
            'en ligne + à valider + brouillons + hors ligne = tous',
        );

        return $summary;
    }

    public function test_les_quatre_etats_partagent_le_portefeuille_de_l_admin(): void
    {
        $summary = $this->assertPastillesEgalesAuxListes($this->admin);

        $this->assertSame(
            ['total' => 14, 'online' => 4, 'pending_validation' => 2, 'drafts' => 2, 'offline' => 6, 'sold_or_rented' => 2, 'archived' => 2],
            array_intersect_key($summary, array_flip(['total', 'online', 'pending_validation', 'drafts', 'offline', 'sold_or_rented', 'archived'])),
        );
        $this->assertSame(['En attente', 'En revue'], $this->titres($this->admin, '&filter[listing]=pending'));
        $this->assertSame(
            ['Bien de test', 'Loué', 'Privé validé', 'Public sans date', 'Refusé', 'Vendu'],
            $this->titres($this->admin, '&filter[listing]=offline'),
        );
    }

    public function test_en_ligne_est_le_filtre_public_et_hors_ligne_sa_negation(): void
    {
        $this->assertSame($this->titres($this->admin, '&filter[public]=1'), $this->titres($this->admin, '&filter[listing]=online'));

        $tous = $this->titres($this->admin, '');
        $partition = array_merge(...array_map(
            fn (string $etat) => $this->titres($this->admin, '&filter[listing]='.$etat),
            Property::LISTING_STATES,
        ));
        sort($partition);
        $this->assertSame($tous, $partition, 'chaque bien dans un état et un seul');
    }

    public function test_le_bailleur_ne_compte_que_ses_biens(): void
    {
        $summary = $this->assertPastillesEgalesAuxListes($this->owner);

        $this->assertSame([11, 2, 2, 1, 6, 2, 1], [
            $summary['total'], $summary['online'], $summary['pending_validation'], $summary['drafts'],
            $summary['offline'], $summary['sold_or_rented'], $summary['archived'],
        ]);
    }

    public function test_l_agent_sous_mes_biens(): void
    {
        $summary = $this->assertPastillesEgalesAuxListes($this->agent, '&filter[user_id]='.$this->agent->id);

        $this->assertSame([2, 1, 0, 1, 0, 1], [
            $summary['total'], $summary['online'], $summary['pending_validation'], $summary['drafts'],
            $summary['offline'], $summary['archived'],
        ]);
    }

    public function test_les_archives_se_comptent_avec_ou_sans_include_archived(): void
    {
        $this->assertSame(2, $this->summary($this->admin)['archived']);
        $avec = $this->assertPastillesEgalesAuxListes($this->admin, '&include_archived=1');

        $this->assertSame(2, $avec['archived']);
        $this->assertSame(16, $avec['total']);
        $this->assertSame(8, $avec['offline'], 'un archivé est hors ligne');
    }

    public function test_une_valeur_inconnue_est_refusee_une_liste_ignoree(): void
    {
        $this->actingAsApi($this->admin);
        $this->getJson('/api/properties?filter[listing]=publie')->assertStatus(422);
        $this->assertCount(14, $this->titres($this->admin, '&filter[listing][]=online'));
    }
}
