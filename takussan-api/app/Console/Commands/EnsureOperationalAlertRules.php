<?php

namespace App\Console\Commands;

use App\Domain\Alerts\AlertableEvents;
use App\Models\AlertRule;
use App\Services\Admin\AlertRuleService;
use App\Services\Auth\SuperAdminCooptationService;
use Illuminate\Console\Command;

/**
 * TCK-768 (P14.03) — une alerte `ops_*` ne part que vers une règle `alert_rules` active, et rien
 * n'en créait : sur une base neuve, `alerts:evaluate` écrivait au journal d'audit et nulle part
 * ailleurs. Jouée par `docker/release.sh` à chaque déploiement.
 *
 * Crée, pour chaque événement d'exploitation du catalogue qui n'a AUCUNE règle, une règle courriel
 * destinée aux super-admins actifs. Une règle existante, même coupée ou retouchée depuis la console,
 * n'est jamais réécrite. Sans super-admin, rien n'est créé : le déploiement suivant rattrape.
 */
class EnsureOperationalAlertRules extends Command
{
    protected $signature = 'alerts:ensure-ops-rules';

    protected $description = "Crée les règles d'alerte d'exploitation (ops_*) manquantes, destinées aux super-admins (idempotent).";

    public function handle(SuperAdminCooptationService $operateurs): int
    {
        $emails = $operateurs->superAdmins()->pluck('email')->filter()->unique()->values()->all();
        if ($emails === []) {
            $this->warn("Aucun super-admin : aucune règle d'exploitation créée.");

            return self::SUCCESS;
        }

        $evenements = array_filter(AlertableEvents::keys(), AlertRuleService::isOperational(...));
        foreach ($evenements as $evenement) {
            if (AlertRule::query()->where('event', $evenement)->exists()) {
                continue;
            }

            AlertRule::create([
                'event' => $evenement,
                'channels_json' => ['email'],
                'recipients_json' => ['emails' => $emails],
                'is_active' => true,
            ]);
            $this->line("Règle créée : {$evenement}");
        }

        return self::SUCCESS;
    }
}
