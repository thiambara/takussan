<?php

namespace Tests\Unit\Architecture;

use PHPUnit\Framework\TestCase;

/**
 * TCK-2395 (ADR-0077 §5, AC1 d) — **le numéro des notifications ne sert jamais à prospecter** : son blocage pour « spam »
 * couperait les notifications des baux. Aucun fichier du Radar ne nomme ce qui envoie par ce numéro — le pilote et le
 * contrat des notifications, leur canal, le localisateur de l'intégration `whatsapp_cloud` — ni ne lit ses identifiants.
 * Le Radar envoie par `RadarWhatsappDriver`, qui ne lit que `config/radar_whatsapp.php`.
 *
 * Le comportement est prouvé par `RadarWhatsappOutreachTest` (ce qui part sur le fil) ; cette garde ferme le chemin de
 * code qu'aucun test de comportement n'aurait encore écrit. Elle se garde elle-même : un balayage qui ne lit plus le
 * Radar rougit.
 */
class RadarNeProspectePasParLeNumeroDesNotificationsTest extends TestCase
{
    /** Les classes qui envoient par le numéro des notifications, ou en trouvent les identifiants. */
    private const CLASSES_INTERDITES = [
        'CloudApiWhatsappDriver',
        'LogWhatsappDriver',
        'WhatsappDriverInterface',
        'WhatsappChannel',
        'SupportsWhatsapp',
        'IntegrationLocator',
    ];

    /** Les clés de configuration du numéro des notifications. */
    private const CLES_INTERDITES = ['whatsapp.webhook_app_secret', 'whatsapp.webhook_url_token', 'whatsapp.webhook_verify_token', 'whatsapp.integration_provider'];

    /**
     * La seule lecture permise : la garde qui REFUSE l'identifiant de numéro des intégrations des notifications.
     *
     * @var array<string, list<string>>
     */
    private const EXCEPTIONS = [
        'Services/Radar/Whatsapp/RadarWhatsappNumber.php' => ['whatsapp.integration_provider'],
    ];

    public function test_aucun_fichier_du_radar_ne_passe_par_le_numero_des_notifications(): void
    {
        $fichiers = $this->fichiersDuRadar();
        $this->assertGreaterThan(40, count($fichiers), 'Le balayage ne trouve plus le Radar : cette garde ne garde plus rien.');
        $this->assertContains('Services/Radar/Whatsapp/RadarCloudWhatsappDriver.php', array_keys($fichiers));

        $fautes = [];
        foreach ($fichiers as $relatif => $source) {
            array_push($fautes, ...$this->fautes($relatif, $source));
        }

        $this->assertSame([], $fautes, 'Un fichier du Radar passe par le numéro des notifications.');
    }

    /** La garde voit ce qu'elle cherche — un import du pilote des notifications, une clé de son webhook — et pas un commentaire. */
    public function test_la_garde_reconnait_un_chemin_interdit(): void
    {
        $source = "<?php\nuse App\\Services\\Notifications\\Whatsapp\\CloudApiWhatsappDriver;\n// LogWhatsappDriver en commentaire\n\$x = config('whatsapp.webhook_app_secret');\n\$y = config('whatsapp.integration_provider');\n";

        $this->assertSame([
            'Services/Radar/Exemple.php : CloudApiWhatsappDriver',
            'Services/Radar/Exemple.php : whatsapp.webhook_app_secret',
            'Services/Radar/Exemple.php : whatsapp.integration_provider',
        ], $this->fautes('Services/Radar/Exemple.php', $source));
        $this->assertSame([], $this->fautes('Services/Radar/Whatsapp/RadarWhatsappNumber.php', "<?php\n\$y = config('whatsapp.integration_provider');\n"));
    }

    /**
     * Le CODE seul : un commentaire qui nomme le pilote des notifications pour dire qu'on ne s'en sert pas n'est pas un chemin.
     *
     * @return list<string>
     */
    private function fautes(string $relatif, string $source): array
    {
        $fautes = [];
        foreach (token_get_all($source) as $jeton) {
            if (! is_array($jeton)) {
                continue;
            }
            [$type, $texte] = $jeton;
            if (in_array($type, [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true)) {
                $nom = substr((string) strrchr('\\'.$texte, '\\'), 1);
                if (in_array($nom, self::CLASSES_INTERDITES, true)) {
                    $fautes[] = "{$relatif} : {$nom}";
                }
            }
            if ($type === T_CONSTANT_ENCAPSED_STRING) {
                $cle = trim($texte, '\'"');
                if (in_array($cle, self::CLES_INTERDITES, true) && ! in_array($cle, self::EXCEPTIONS[$relatif] ?? [], true)) {
                    $fautes[] = "{$relatif} : {$cle}";
                }
            }
        }

        return $fautes;
    }

    public function test_le_pilote_du_radar_ne_lit_ses_identifiants_que_dans_sa_configuration(): void
    {
        $racine = dirname(__DIR__, 3).'/app/Services/Radar/Whatsapp/';
        $pilote = (string) file_get_contents($racine.'RadarCloudWhatsappDriver.php');
        $numero = (string) file_get_contents($racine.'RadarWhatsappNumber.php');

        $this->assertStringNotContainsString('Integration', $pilote, 'le pilote ne lit aucune intégration');
        $this->assertStringContainsString("config('radar_whatsapp.phone_number_id'", $numero);
        $this->assertStringContainsString("config('radar_whatsapp.access_token'", $numero);
        // L'identifiant d'une intégration n'est lu que pour être comparé et refusé.
        $this->assertSame(1, substr_count($numero, "['phone_number_id']"));
        $this->assertStringContainsString("'radar.whatsapp.same_number'", $numero);
    }

    /** @return array<string, string> chemin relatif à `app/` → source */
    private function fichiersDuRadar(): array
    {
        $racine = dirname(__DIR__, 3).'/app/';
        $chemins = array_merge(
            glob($racine.'Services/Radar/*.php') ?: [],
            glob($racine.'Services/Radar/*/*.php') ?: [],
            glob($racine.'Jobs/Radar/*.php') ?: [],
            glob($racine.'Http/Controllers/Api/Admin/Radar*.php') ?: [],
            glob($racine.'Http/Controllers/Webhook/RadarWhatsapp*.php') ?: [],
            glob($racine.'Console/Commands/Radar*.php') ?: [],
        );

        $fichiers = [];
        foreach ($chemins as $chemin) {
            $fichiers[substr($chemin, strlen($racine))] = (string) file_get_contents($chemin);
        }

        return $fichiers;
    }
}
