<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\ConversationType;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2630 — `GET /api/conversations` : `filter[search]`, `filter[unread]`, `filter[type]` et
 * `meta.counts`, sous le cloisonnement de la liste (`ConversationAccess::constrainListing`).
 *
 * La recherche replie la CASSE par `CaseInsensitive` (ADR-0025), jamais les accents (ADR-0020 §2) :
 * « NDIAYÉ » trouve « Ndiayé », « ndiaye » ne le trouve pas — la même règle que la recherche de
 * biens de `ConversationContextController` (TCK-576).
 */
class ConversationListFiltersTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private User $malick;

    private User $awa;

    private Conversation $filMalick;

    private Conversation $filAwa;

    private Conversation $groupe;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = User::factory()->create(['first_name' => 'Fatou', 'last_name' => 'Sow']);
        $this->materializeRoleProfile($this->agent, 'agent', $this->agency);

        $this->malick = User::factory()->create(['first_name' => 'Malick', 'last_name' => 'Seck']);
        // Une majuscule NON ASCII : `lower()` de PostgreSQL sous `--locale=C` ne la replie pas.
        $this->awa = User::factory()->create(['first_name' => 'Awa', 'last_name' => 'NDIAYÉ']);

        $maison = $this->bien('Maison avec jardin · Thiès', 'TK-THS-001');
        $studio = $this->bien('Studio meublé · Mermoz', 'TK-MRZ-002');

        // Fils de prospect (directe + bien) : le prospect les ouvre, l'agent titulaire du bien y répond.
        $this->filMalick = $this->fil(ConversationType::Direct, null, $this->malick, [$this->agent, $this->malick], $maison);
        $this->filAwa = $this->fil(ConversationType::Direct, null, $this->awa, [$this->agent, $this->awa], $studio);
        $this->groupe = $this->fil(ConversationType::Group, 'Suivi des impayés', $this->agent, [$this->agent, $this->malick, $this->awa]);

        // Un message non lu pour l'agent, dans le seul fil d'Awa.
        $this->message($this->filAwa, $this->awa, 'Bonjour, le studio est-il libre ?');
    }

    private function bien(string $title, string $reference): Property
    {
        return Property::factory()->create([
            'title' => $title,
            'reference_number' => $reference,
            'user_id' => $this->agent->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    /** @param  list<User>  $membres */
    private function fil(ConversationType $type, ?string $subject, User $createur, array $membres, ?Property $bien = null): Conversation
    {
        $fil = Conversation::factory()->create([
            'type' => $type,
            'subject' => $subject,
            'created_by' => $createur->id,
            'property_id' => $bien?->id,
            'last_message_at' => now(),
        ]);
        foreach ($membres as $membre) {
            $fil->participants()->attach($membre->id, ['joined_at' => now(), 'last_read_at' => now()]);
        }

        return $fil;
    }

    private function message(Conversation $fil, User $auteur, string $texte): void
    {
        $this->travel(1)->minutes();
        Message::factory()->create([
            'conversation_id' => $fil->id,
            'sender_id' => $auteur->id,
            'type' => MessageType::Text,
            'content' => $texte,
        ]);
    }

    /** @return list<int> */
    private function ids(string $query, ?User $as = null): array
    {
        Sanctum::actingAs($as ?? $this->agent);

        $ids = $this->getJson('/api/conversations'.$query)->assertOk()->json('data.*.id');
        sort($ids);

        return $ids;
    }

    /** AC1 — le titre du bien, casse non ASCII comprise. */
    public function test_la_recherche_trouve_le_fil_par_le_titre_du_bien(): void
    {
        $this->assertSame([$this->filMalick->id], $this->ids('?filter[search]='.urlencode('THIÈS')));
        $this->assertSame([$this->filMalick->id], $this->ids('?filter[search]=jardin'));
    }

    /** AC1, AC5 — le nom d'un participant, « NDIAYÉ » trouvé par « ndiayé » : le repli de `CaseInsensitive`. */
    public function test_la_recherche_trouve_le_fil_par_le_nom_d_un_participant_casse_non_ascii_comprise(): void
    {
        // Awa est aussi membre du groupe : son nom le trouve aussi.
        $this->assertSame([$this->filAwa->id, $this->groupe->id], $this->ids('?filter[search]='.urlencode('ndiayé')));
        // Prénom ET nom : chaque mot doit trouver une colonne.
        $this->assertSame([$this->filAwa->id, $this->groupe->id], $this->ids('?filter[search]='.urlencode('awa ndiayé')));
        $this->assertSame([$this->filMalick->id, $this->groupe->id], $this->ids('?filter[search]=SECK'));

        // AC1 à la lettre : `NDIAYE` rend le seul fil d'Awa une fois qu'elle a quitté le groupe.
        $this->groupe->participants()->updateExistingPivot($this->awa->id, ['left_at' => now()]);
        $this->assertSame([$this->filAwa->id], $this->ids('?filter[search]=NDIAY'));
    }

    public function test_la_recherche_trouve_par_la_reference_et_le_sujet(): void
    {
        $this->assertSame([$this->filAwa->id], $this->ids('?filter[search]=tk-mrz'));
        $this->assertSame([$this->groupe->id], $this->ids('?filter[search]=impay'));
    }

    /** Le nom de l'appelant ne trouve rien : il est dans tous ses fils. */
    public function test_le_nom_de_l_appelant_n_est_pas_cherche(): void
    {
        $this->assertSame([], $this->ids('?filter[search]=fatou'));
    }

    /** Un ancien membre n'est plus cherché. */
    public function test_un_ancien_membre_n_est_pas_cherche(): void
    {
        $this->groupe->participants()->updateExistingPivot($this->malick->id, ['left_at' => now()]);

        $this->assertSame([$this->filMalick->id], $this->ids('?filter[search]=seck'));
    }

    public function test_une_recherche_d_un_caractere_est_ignoree_et_les_jokers_sont_litteraux(): void
    {
        $tous = [$this->filMalick->id, $this->filAwa->id, $this->groupe->id];
        sort($tous);

        // « q » ne figure dans aucun nom, titre, référence ni sujet : appliqué, il viderait la liste.
        $this->assertSame($tous, $this->ids('?filter[search]=q'));
        $this->assertSame($tous, $this->ids('?filter[search]=%20%20q%20'));
        $this->assertSame([], $this->ids('?filter[search]=qq'));
        $this->assertSame([], $this->ids('?filter[search]=%25%25'));
    }

    public function test_unread_et_type_filtrent_et_se_cumulent(): void
    {
        $this->assertSame([$this->filAwa->id], $this->ids('?filter[unread]=1'));
        $this->assertSame([$this->groupe->id], $this->ids('?filter[type]=group'));
        $this->assertSame([$this->filMalick->id, $this->filAwa->id], $this->ids('?filter[type]=direct'));
        $this->assertSame([], $this->ids('?filter[type]=group&filter[unread]=1'));
        $this->assertSame([$this->groupe->id], $this->ids('?filter[type]=group&filter[search]='.urlencode('ndiayé')));

        $tous = [$this->filMalick->id, $this->filAwa->id, $this->groupe->id];
        $this->assertSame($tous, $this->ids('?filter[unread]=0'));
    }

    /** AC2 — les compteurs des puces ne suivent ni la recherche, ni les filtres, ni les archives. */
    public function test_meta_counts_porte_sur_tout_le_cloisonne_hors_archives(): void
    {
        Sanctum::actingAs($this->agent);
        $attendu = ['all' => 3, 'unread' => 1, 'group' => 1];

        foreach (['', '?filter[search]='.urlencode('thiès'), '?filter[type]=group', '?filter[unread]=1', '?archived=1'] as $query) {
            $reponse = $this->getJson('/api/conversations'.$query)->assertOk();
            $this->assertSame($attendu, $reponse->json('meta.counts'), $query);
            // Le total de la pastille ne suit pas les filtres (sous `archived=1`, il reste celui des
            // archives, comme avant TCK-2630).
            if ($query !== '?archived=1') {
                $this->assertSame(1, $reponse->json('meta.unread_total'), $query);
            }
        }

        // Archivé : il quitte les compteurs.
        $this->filAwa->participants()->updateExistingPivot($this->agent->id, ['archived_at' => now()]);
        $this->assertSame(['all' => 2, 'unread' => 0, 'group' => 1], $this->getJson('/api/conversations')->json('meta.counts'));
    }

    /** `counts.unread` compte les FILS (sourdine comprise), `unread_total` les messages hors sourdine. */
    public function test_counts_unread_compte_les_fils_en_sourdine(): void
    {
        $this->message($this->filAwa, $this->awa, 'Toujours là ?');
        $this->message($this->groupe, $this->malick, 'Point sur les impayés');
        $this->groupe->participants()->updateExistingPivot($this->agent->id, ['is_muted' => true]);

        Sanctum::actingAs($this->agent);
        $meta = $this->getJson('/api/conversations')->assertOk()->json('meta');

        $this->assertSame(2, $meta['counts']['unread']);
        $this->assertSame(2, $meta['unread_total']);
    }

    /** Le cloisonnement tient sous la recherche : le fil d'un autre agent n'est pas trouvé. */
    public function test_la_recherche_ne_sort_pas_du_cloisonnement(): void
    {
        $this->assertSame([], $this->ids('?filter[search]='.urlencode('thiès'), $this->awa));
        $this->assertSame([$this->filAwa->id], $this->ids('?filter[search]=mermoz', $this->awa));
    }

    public function test_une_saisie_mal_formee_rend_422(): void
    {
        Sanctum::actingAs($this->agent);

        $this->getJson('/api/conversations?filter[type]=broadcast')->assertUnprocessable()->assertJsonValidationErrors('filter.type');
        $this->getJson('/api/conversations?filter[unread]=peut-etre')->assertUnprocessable()->assertJsonValidationErrors('filter.unread');
        $this->getJson('/api/conversations?filter[search][]=a')->assertUnprocessable()->assertJsonValidationErrors('filter.search');
        $this->getJson('/api/conversations?filter=abc')->assertUnprocessable()->assertJsonValidationErrors('filter');
        // Un octet hors UTF-8 : la recherche n'est pas ignorée en silence (la liste entière revenait).
        $this->getJson('/api/conversations?filter[search]=%C3%28ab')->assertUnprocessable()->assertJsonValidationErrors('filter.search');
    }

    /** Pas de N+1 : la recherche ajoute une condition, pas une requête par fil. */
    public function test_le_nombre_de_requetes_ne_depend_pas_du_nombre_de_fils(): void
    {
        // Les lignes REVIENNENT (le fil d'Awa + les fils créés) : un compte constant sur une page
        // vide ne prouverait rien. Déjà vert avant TCK-2630 — la recherche s'écrit en `whereHas`.
        $compte = function (int $lignes): int {
            Sanctum::actingAs($this->agent);
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/conversations?filter[search]='.urlencode('ndiayé').'&filter[type]=direct&filter[unread]=1&per_page=50')
                ->assertOk()->assertJsonCount($lignes, 'data');
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $this->creerFils(2);
        $peu = $compte(3);
        $this->creerFils(25);
        $beaucoup = $compte(28);

        $this->assertSame($peu, $beaucoup);
    }

    /**
     * TCK-2632 — `filter[participant]` : « Nouvelle conversation » retrouve le fil direct déjà
     * ouvert avec une personne. Le filtre restreint la liste de l'appelant, il ne l'élargit jamais.
     */
    public function test_participant_rend_les_seuls_fils_de_l_appelant_avec_cette_personne(): void
    {
        $this->assertSame([$this->filMalick->id], $this->ids('?filter[type]=direct&filter[participant]='.$this->malick->id));
        // Le fil de l'appelant avec une AUTRE personne n'en sort pas ; le groupe où Malick est membre, si.
        $this->assertSame([$this->filMalick->id, $this->groupe->id], $this->ids('?filter[participant]='.$this->malick->id));
    }

    public function test_participant_ne_rend_pas_un_fil_que_la_personne_a_quitte(): void
    {
        $this->groupe->participants()->updateExistingPivot($this->malick->id, ['left_at' => now()]);

        $this->assertSame([$this->filMalick->id], $this->ids('?filter[participant]='.$this->malick->id));
    }

    public function test_participant_n_ouvre_pas_le_fil_de_deux_tiers(): void
    {
        // Malick et Awa s'écrivent sans l'agent : le bon identifiant ne suffit pas à le lui montrer.
        $tiers = $this->fil(ConversationType::Direct, null, $this->malick, [$this->malick, $this->awa]);

        $ids = $this->ids('?filter[type]=direct&filter[participant]='.$this->awa->id);
        $this->assertNotContains($tiers->id, $ids);
        $this->assertSame([$this->filAwa->id], $ids);
        // Et l'agent n'est membre d'aucun fil avec une personne inconnue de lui.
        $this->assertSame([], $this->ids('?filter[participant]='.User::factory()->create()->id));
    }

    /**
     * TCK-2632 (décision b) — un fil direct que l'appelant a ARCHIVÉ est retrouvé par
     * `filter[participant]` : « Nouvelle conversation » le rouvre au lieu d'en ouvrir un second.
     * La liste par défaut, elle, reste sans archives, et ses compteurs n'en tiennent pas compte.
     */
    public function test_participant_retrouve_un_fil_archive_par_l_appelant(): void
    {
        $this->filMalick->participants()->updateExistingPivot($this->agent->id, ['archived_at' => now()]);

        $this->assertSame([$this->filMalick->id], $this->ids('?filter[type]=direct&filter[participant]='.$this->malick->id));
        $this->assertNotContains($this->filMalick->id, $this->ids(''));

        Sanctum::actingAs($this->agent);
        $reponse = $this->getJson('/api/conversations?filter[type]=direct&filter[participant]='.$this->malick->id)->assertOk();
        $this->assertSame(['all' => 2, 'unread' => 1, 'group' => 1], $reponse->json('meta.counts'));
    }

    /**
     * L'élargissement aux archives ne vaut que pour les fils de l'APPELANT : le fil de deux tiers,
     * archivé par l'un d'eux, n'en sort pas ; ni un fil que l'appelant a quitté puis archivé.
     */
    public function test_participant_ne_rend_jamais_le_fil_d_un_tiers_meme_archive(): void
    {
        $tiers = $this->fil(ConversationType::Direct, null, $this->malick, [$this->malick, $this->awa]);
        $tiers->participants()->updateExistingPivot($this->malick->id, ['archived_at' => now()]);
        $tiers->participants()->updateExistingPivot($this->awa->id, ['archived_at' => now()]);

        $this->assertNotContains($tiers->id, $this->ids('?filter[participant]='.$this->awa->id));
        $this->assertNotContains($tiers->id, $this->ids('?filter[type]=direct&filter[participant]='.$this->malick->id));

        // Quitté puis archivé par l'appelant : pas rendu non plus.
        $this->groupe->participants()->updateExistingPivot($this->agent->id, ['left_at' => now(), 'archived_at' => now()]);
        $this->assertSame([$this->filMalick->id], $this->ids('?filter[participant]='.$this->malick->id));
    }

    /** L'archive d'un fil est privée, comme la sourdine : rendue au seul lecteur, absente pour les autres. */
    public function test_archived_at_n_est_rendu_que_pour_le_lecteur(): void
    {
        $this->filMalick->participants()->updateExistingPivot($this->agent->id, ['archived_at' => now()]);

        Sanctum::actingAs($this->agent);
        $lignes = collect($this->getJson('/api/conversations?filter[participant]='.$this->malick->id)
            ->assertOk()->json('data'))->firstWhere('id', $this->filMalick->id)['participants'];
        $moi = collect($lignes)->firstWhere('user_id', $this->agent->id);
        $lui = collect($lignes)->firstWhere('user_id', $this->malick->id);
        $this->assertNotNull($moi['archived_at']);
        $this->assertArrayNotHasKey('archived_at', $lui);

        // Vu de Malick, qui n'a rien archivé : sa ligne dit `null`, celle de l'agent ne dit rien.
        Sanctum::actingAs($this->malick);
        $lignes = $this->getJson('/api/conversations/'.$this->filMalick->id)->assertOk()->json('data.participants');
        $this->assertNull(collect($lignes)->firstWhere('user_id', $this->malick->id)['archived_at']);
        $this->assertArrayNotHasKey('archived_at', collect($lignes)->firstWhere('user_id', $this->agent->id));
    }

    public function test_participant_mal_forme_rend_422(): void
    {
        Sanctum::actingAs($this->agent);

        $this->getJson('/api/conversations?filter[participant]=abc')->assertUnprocessable()->assertJsonValidationErrors('filter.participant');
        $this->getJson('/api/conversations?filter[participant]=0')->assertUnprocessable()->assertJsonValidationErrors('filter.participant');
        $this->getJson('/api/conversations?filter[participant][]=1')->assertUnprocessable()->assertJsonValidationErrors('filter.participant');
    }

    /**
     * Vérification adverse de TCK-2632 — `filter[participant]=<soi>` : l'appelant est membre de tous ses
     * fils, et le filtre élargit la page aux archives (décision b) — la liste entière, archives
     * comprises, sans fuite mais sans objet. Le front ne l'envoie jamais : c'est une erreur du client.
     */
    public function test_participant_soi_meme_rend_422(): void
    {
        Sanctum::actingAs($this->agent);

        $this->getJson('/api/conversations?filter[participant]='.$this->agent->id)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('filter.participant');
        $this->getJson('/api/conversations?filter[participant]='.$this->malick->id)->assertOk();
    }

    private function creerFils(int $n): void
    {
        for ($i = 0; $i < $n; $i++) {
            $client = User::factory()->create(['last_name' => 'Ndiayé']);
            $fil = $this->fil(ConversationType::Direct, null, $this->agent, [$this->agent, $client]);
            $this->message($fil, $client, 'Bonjour');
        }
    }
}
