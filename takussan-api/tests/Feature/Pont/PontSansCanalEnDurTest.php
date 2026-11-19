<?php

namespace Tests\Feature\Pont;

use App\Models\IntegrationWebhookLog;
use App\Models\Message;
use App\Models\MessageRelay;
use App\Models\PropertyContactLead;
use App\Models\WhatsappContact;
use App\Services\Pont\CanalDuPont;
use App\Services\Pont\EtatDAccord;
use App\Services\Pont\RegistreDesCanaux;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use Tests\ApiTestCase;
use Tests\Support\Pont\FauxCanal;
use Tests\Support\SceneDuPont;

/**
 * TCK-2980 (ADR-0132 § 0, révisé) — un canal neuf (Telegram, Messenger…) ne demande qu'une classe qui implémente
 * {@see CanalDuPont}, une entrée de `config('messagerie.canaux')` et ses clés :
 *  1. chaque entrée du registre implémente le contrat, sous son nom ;
 *  2. le pont (`app/Services/Pont` hors `Canaux/`, et le contrôleur du webhook générique) ne nomme aucun canal ni
 *     fournisseur dans son CODE (jetons PHP, commentaires exclus) ;
 *  3. un faux pilote, enregistré par la seule config, reçoit par `webhooks/messagerie/faux/{token}` : 404 pour un
 *     canal inconnu, inactif ou sans « reçoit », 404 pour un mauvais jeton, 403 pour une signature refusée ; puis il
 *     route un message dans un fil (`channel = faux`), applique ses accusés, et STOP ne coupe QUE ce canal.
 */
class PontSansCanalEnDurTest extends ApiTestCase
{
    use RefreshDatabase, SceneDuPont;

    private const MOTS_INTERDITS = '/whatsapp|wamid|\bmeta\b|\bsms\b|telegram|messenger/i';

    protected function setUp(): void
    {
        parent::setUp();
        FauxCanal::remettreAZero();
    }

    /** @param  array<string, mixed>  $corps */
    private function webhook(array $corps, string $canal = FauxCanal::NOM, string $jeton = FauxCanal::JETON, string $signature = 'ok'): TestResponse
    {
        return $this->withHeaders(['X-Faux-Signature' => $signature])->postJson("/api/webhooks/messagerie/{$canal}/{$jeton}", $corps);
    }

    private function brancherLeFaux(): void
    {
        $this->monterLePont();
        config()->set('messagerie.canaux.'.FauxCanal::NOM, ['actif' => true, 'pilote' => FauxCanal::class]);
        FauxCanal::$numeros = ['FAUX-A' => $this->agence->id];
    }

    public function test_chaque_pilote_du_registre_implemente_le_contrat_sous_son_nom(): void
    {
        $noms = RegistreDesCanaux::noms();
        $this->assertNotSame([], $noms);
        foreach ($noms as $nom) {
            $canal = app(RegistreDesCanaux::class)->canal($nom);
            $this->assertInstanceOf(CanalDuPont::class, $canal);
            $this->assertSame($nom, $canal->nom());
            $this->assertNotSame(RegistreDesCanaux::APP, $nom);
        }
    }

    public function test_le_pont_ne_nomme_aucun_canal_dans_son_code(): void
    {
        $racine = dirname(__DIR__, 3).'/app';
        $fichiers = [$racine.'/Http/Controllers/Webhook/MessagerieWebhookController.php'];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine.'/Services/Pont', RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() === 'php' && ! str_contains($fichier->getPathname(), '/Canaux/')) {
                $fichiers[] = $fichier->getPathname();
            }
        }
        foreach ($fichiers as $chemin) {
            $code = '';
            foreach (token_get_all((string) file_get_contents($chemin)) as $jeton) {
                $code .= is_array($jeton) ? (in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true) ? ' ' : $jeton[1]) : $jeton;
            }
            $this->assertDoesNotMatchRegularExpression(self::MOTS_INTERDITS, $code, basename($chemin).' nomme un canal en dur');
        }
        // La garde voit bien le pont (le contrat, le routage, l'entrée, le registre…) et le webhook générique.
        $this->assertGreaterThanOrEqual(11, count($fichiers));
    }

    public function test_la_garde_du_webhook_generique(): void
    {
        $this->brancherLeFaux();
        $corps = ['messages' => [['de' => self::TEL_INCONNU, 'vers' => 'FAUX-A', 'id' => 'faux-0', 'texte' => 'Bonjour']]];

        $this->webhook($corps, canal: 'inconnu')->assertNotFound();
        $this->webhook($corps, jeton: 'mauvais')->assertNotFound();
        $this->webhook($corps, signature: 'non')->assertForbidden();
        config()->set('messagerie.canaux.'.FauxCanal::NOM.'.actif', false);
        $this->webhook($corps)->assertNotFound();
        config()->set('messagerie.canaux.'.FauxCanal::NOM.'.actif', true);
        FauxCanal::$recoit = false;
        $this->webhook($corps)->assertNotFound();
        // Le GET d'un canal sans vérification d'abonnement : 404.
        FauxCanal::$recoit = true;
        $this->get('/api/webhooks/messagerie/faux/'.FauxCanal::JETON)->assertNotFound();

        $this->assertSame([], FauxCanal::$entrants);
        $this->assertSame(0, MessageRelay::query()->count());
    }

    public function test_un_faux_pilote_route_par_le_webhook_generique_sans_rien_de_whatsapp(): void
    {
        $this->brancherLeFaux();
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);

        $corps = ['messages' => [['de' => self::TEL_BAILLEUR, 'vers' => 'FAUX-A', 'id' => 'faux-1', 'texte' => 'Par le faux canal.']], 'accuses' => [['id' => 'faux-sortant', 'statut' => 'lu']]];
        $this->webhook($corps)->assertOk();
        $this->webhook($corps)->assertOk();
        $this->webhook(['messages' => [['de' => self::TEL_BAILLEUR, 'vers' => 'AUTRE', 'id' => 'faux-2', 'texte' => 'Ignoré']]])->assertOk();

        $message = Message::query()->where('sender_id', $this->bailleur->id)->sole();
        $this->assertSame('faux', $message->channel);
        $this->assertSame($this->fil->id, (int) $message->conversation_id);
        $this->assertSame(['faux-1'], FauxCanal::$entrants);
        $this->assertSame(['faux-sortant:lu', 'faux-sortant:lu'], FauxCanal::$accuses);
        $this->assertSame('faux', MessageRelay::query()->sole()->channel);
        $journal = IntegrationWebhookLog::query()->orderBy('id')->first();
        $this->assertSame('messagerie', $journal?->channel);
        $this->assertSame('faux', $journal?->provider);
        $this->assertSame('messages', $journal?->event_type);
    }

    /** L'accord se tient par (numéro, canal) : STOP sur le faux canal ne coupe pas WhatsApp, et l'inverse. */
    public function test_stop_ne_coupe_que_son_canal(): void
    {
        $this->brancherLeFaux();
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);
        $this->relaisSortant($this->fil, $this->bailleur, 'wamid.SORTANT-F');

        $this->webhook(['messages' => [['de' => self::TEL_BAILLEUR, 'vers' => 'FAUX-A', 'id' => 'faux-3', 'texte' => 'STOP']]])->assertOk();

        $this->assertSame(EtatDAccord::Oppose, FauxCanal::$accords[self::TEL_BAILLEUR]);
        $this->assertFalse((bool) WhatsappContact::query()->where('phone', self::TEL_BAILLEUR)->first()?->isOptedOut());

        $this->recevoir([$this->texte('wamid.F-STOP', self::TEL_BAILLEUR, 'STOP')])->assertOk();
        $this->assertTrue(WhatsappContact::query()->where('phone', self::TEL_BAILLEUR)->sole()->isOptedOut());
        $this->webhook(['messages' => [['de' => self::TEL_BAILLEUR, 'vers' => 'FAUX-A', 'id' => 'faux-4', 'texte' => 'START']]])->assertOk();
        $this->assertSame(EtatDAccord::Accorde, FauxCanal::$accords[self::TEL_BAILLEUR]);
        $this->assertTrue(WhatsappContact::query()->where('phone', self::TEL_BAILLEUR)->sole()->isOptedOut());

        // Un canal sans prospect : un inconnu n'écrit rien.
        $this->webhook(['messages' => [['de' => self::TEL_INCONNU, 'vers' => 'FAUX-A', 'id' => 'faux-5', 'texte' => 'Bonjour']]])->assertOk();
        $this->assertSame(0, PropertyContactLead::query()->count());
    }
}
