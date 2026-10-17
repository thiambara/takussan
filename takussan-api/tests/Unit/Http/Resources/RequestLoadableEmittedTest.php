<?php

namespace Tests\Unit\Http\Resources;

use Illuminate\Support\Str;
use ReflectionClass;
use Tests\TestCase;

/**
 * TCK-807 (piste P21.05) — un `include=` accepté est un `include=` émis.
 *
 * `$requestLoadable` ouvre `include=<relation>` sur la liste d'un modèle. Quand la ressource du
 * modèle n'émet pas la relation, la requête rend 200, paie le chargement en base, et l'appelant
 * lit une clé absente comme une relation vide (cas réel : P21.04, le garant du bail).
 *
 * Ce test confronte, pour chaque modèle de `app/Models` qui déclare `$requestLoadable` et qui a une
 * ressource `App\Http\Resources\<Modèle>Resource`, chaque relation déclarée aux `whenLoaded('…')`
 * et `relationLoaded('…')` du source de la ressource. Il lit une forme, pas un comportement : une
 * relation émise autrement (accès direct `$this->rel`) doit être réécrite en `whenLoaded`, ou
 * exemptée ci-dessous avec sa raison.
 *
 * Un modèle sans ressource n'est pas visé : son contrôleur rend le modèle sérialisé, qui émet ses
 * relations chargées.
 */
class RequestLoadableEmittedTest extends TestCase
{
    /**
     * Les écarts relevés par TCK-807 hors des trois modèles de P21.05 (`Lease`, `Payout`,
     * `Booking`), non tranchés : chacun demande de vérifier qu'aucun appelant ne l'envoie, ou de
     * décider d'émettre la relation (donnée exposée, V3). La dette est comptée ici, et le test
     * rougit sur une exemption devenue inutile.
     *
     * @var array<string, list<string>>
     */
    private const EXEMPTIONS = [
        'Agency' => ['primaryAdmin', 'addresses'],
        'AgencyUpgradeRequest' => ['agency', 'submitter', 'reviewer', 'documents'],
        'Customer' => ['user', 'agency', 'addresses', 'tasks'],
        'Document' => ['uploader', 'verifier'],
        'Inventory' => ['conductor', 'tenant'],
        'Invitation' => ['inviter', 'invitedUser', 'agency', 'invitable'],
        'Invoice' => ['customer', 'issuer', 'agency', 'creditedInvoice'],
        'KycDossier' => ['reviewer'],
        'MaintenanceRequest' => ['lease'],
        'OwnerProfile' => ['user', 'agency', 'invitations', 'agencyRole'],
        'PrivacyRequest' => ['user', 'handler'],
        // `tags` est émis sur la fiche par `when($isDetail)`, hors de `whenLoaded`.
        'Property' => ['tags', 'children', 'parent'],
        'ServiceProviderBill' => ['maintenanceRequest', 'property', 'provider', 'payouts'],
        'User' => ['agentProfiles', 'ownerProfiles', 'agencyAdminProfiles', 'platformProfile'],
    ];

    /**
     * @return array<string, array{class-string, string}>
     */
    private function modelesAvecRessource(): array
    {
        $paires = [];
        $racine = app_path('Models');
        $fichiers = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($racine));

        foreach ($fichiers as $fichier) {
            if (! $fichier->isFile() || $fichier->getExtension() !== 'php') {
                continue;
            }
            $relatif = Str::of($fichier->getPathname())->after($racine.DIRECTORY_SEPARATOR)->beforeLast('.php');
            $classe = 'App\\Models\\'.str_replace(DIRECTORY_SEPARATOR, '\\', (string) $relatif);
            if (! class_exists($classe)) {
                continue;
            }
            $reflet = new ReflectionClass($classe);
            if ($reflet->isAbstract() || ! $reflet->hasProperty('requestLoadable')) {
                continue;
            }
            $ressource = app_path('Http/Resources/'.$reflet->getShortName().'Resource.php');
            if (! is_file($ressource)) {
                continue;
            }
            $paires[$reflet->getShortName()] = [$classe, $ressource];
        }

        ksort($paires);

        return $paires;
    }

    /**
     * @param  class-string  $classe
     * @return list<string>
     */
    private function relationsNonEmises(string $classe, string $ressource): array
    {
        $propriete = (new ReflectionClass($classe))->getProperty('requestLoadable');
        $relations = $propriete->getValue() ?? [];
        $source = (string) file_get_contents($ressource);

        return array_values(array_filter($relations, fn (string $relation): bool => preg_match(
            '/(whenLoaded|relationLoaded)\(\s*[\'"]'.preg_quote($relation, '/').'[\'"]/',
            $source,
        ) !== 1));
    }

    public function test_chaque_include_accepte_est_emis_par_la_ressource_du_modele(): void
    {
        $paires = $this->modelesAvecRessource();
        // Plancher : le balayage trouve bien les modèles visés, sinon il ne garderait rien.
        $this->assertArrayHasKey('Lease', $paires);
        $this->assertArrayHasKey('Payout', $paires);
        $this->assertArrayHasKey('Booking', $paires);

        $ecarts = [];
        foreach ($paires as $modele => [$classe, $ressource]) {
            $nonEmises = array_diff($this->relationsNonEmises($classe, $ressource), self::EXEMPTIONS[$modele] ?? []);
            if ($nonEmises !== []) {
                $ecarts[] = $modele.' : '.implode(', ', $nonEmises);
            }
        }

        $this->assertSame([], $ecarts, "Des relations de \$requestLoadable que la ressource du modèle n'émet pas.\n"
            .'Les émettre par whenLoaded(), ou les retirer de $requestLoadable.');
    }

    public function test_aucune_exemption_n_est_devenue_inutile(): void
    {
        $paires = $this->modelesAvecRessource();

        $perimees = [];
        foreach (self::EXEMPTIONS as $modele => $relations) {
            if (! isset($paires[$modele])) {
                $perimees[] = $modele.' : plus de ressource ou plus de $requestLoadable';

                continue;
            }
            [$classe, $ressource] = $paires[$modele];
            $encore = array_diff($relations, $this->relationsNonEmises($classe, $ressource));
            if ($encore !== []) {
                $perimees[] = $modele.' : '.implode(', ', $encore);
            }
        }

        $this->assertSame([], $perimees, 'Exemptions à retirer : la relation est émise, ou plus déclarée.');
    }
}
