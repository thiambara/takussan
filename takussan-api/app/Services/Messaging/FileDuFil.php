<?php

namespace App\Services\Messaging;

use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\CommitmentStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\MessageVisibility;
use App\Models\Enums\UserStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2967 (ADR-0128 § 7) — LA file d'un fil pour un lecteur : `vous`, `attente`, `rappel` ou `ajour`.
 * Aucune colonne ne la stocke : elle se DÉRIVE en SQL, par une jointure latérale (`boite`) sur la requête
 * des conversations, que partagent la page, son filtre `filter[file]`, son ordre, et les comptes
 * (`meta.counts`, `meta.gestes`). Un nombre fixe de requêtes, quel que soit le nombre de fils.
 *
 * Les définitions (ticket TCK-2967, § Contrat de données) :
 *  - **côté du lecteur** : le personnel actif de l'agence du fil ({@see EquipeDuFil::agenceSql()}) forme un
 *    seul côté, l'équipe, quand le lecteur en est (son profil actif, {@see PersonnelDeLAgence::agencesOuPersonnelActif()}).
 *    Tout autre lecteur forme son propre côté. L'auteur d'un message est jugé par la règle du TIERS
 *    ({@see PersonnelDeLAgence::estPersonnel()}), réécrite en liste par {@see self::personnelDe()} ;
 *  - **message compté** : `visibility = all` (une note d'équipe n'entre jamais dans la file), non supprimé,
 *    de tout type sauf `system` et `event` — `text`, `image`, `document`, `audio`, `card` (le dépôt n'a ni
 *    `voice` ni `attachment`) ;
 *  - **`rappel`** : `snoozed_until` du lecteur dans le futur ; prime sur tout ;
 *  - **`vous`** : le dernier message compté vient de l'autre côté, ou un `event` attend encore le lecteur
 *    ({@see NonLus::gesteToujoursAttendu()}), l'un ou l'autre POSTÉRIEUR à `handled_at` (strictement : un
 *    message de la même seconde que « Traité » est réputé traité). Jamais pour un membre de l'équipe autre
 *    que la personne à qui le fil est confié ;
 *  - **`attente`** : le dernier message compté vient du côté du lecteur, ou un `event` attend encore un AUTRE
 *    participant actif, postérieur à `handled_at` ; ou le fil serait `vous` mais il est confié à un autre ;
 *  - **`ajour`** : tout le reste.
 *
 * TCK-2971 (ADR-0130 § 5) — **`retard`**, entre `rappel` et `vous` : le fil porte un engagement `open` dont
 * l'échéance est passée, dont le PORTEUR n'est pas du côté du lecteur (la même règle des côtés,
 * {@see self::deMonCote()}), et que le lecteur SUIT (il en est le bénéficiaire, ou il est du personnel actif
 * de l'agence du fil : `equipe`). « Traité » (`handled_at`) ne s'y applique pas : une promesse non tenue reste
 * à suivre jusqu'à ce qu'elle soit tenue, annulée ou reportée. Le porteur, lui, est `vous` par l'événement
 * `commitment.overdue` (TCK-2970). Préséance : `rappel` > `retard` > `vous` > `attente` > `ajour`.
 *
 * Un fil confié ne vaut que tant que la personne confiée est personnel de l'agence et participante active :
 * confié à quelqu'un qui est parti, il redevient `vous` pour l'équipe.
 *
 * Les identifiants du lecteur, de son agence et du personnel sont des ENTIERS du serveur, écrits dans le SQL
 * après un `(int)` (aucune saisie n'y entre) ; l'instant de référence est lié (`?`), en PHP, pour que
 * `Carbon::setTestNow` le gouverne.
 */
final class FileDuFil
{
    public const VOUS = 'vous';

    public const ATTENTE = 'attente';

    public const RAPPEL = 'rappel';

    public const AJOUR = 'ajour';

    /** TCK-2971 (ADR-0130 § 5) — une promesse faite au lecteur (ou suivie par lui) n'est pas tenue à temps. */
    public const RETARD = 'retard';

    /** @var list<string> */
    public const FILES = [self::VOUS, self::ATTENTE, self::RAPPEL, self::AJOUR, self::RETARD];

    /** L'alias de la jointure latérale. */
    public const ALIAS = 'boite';

    private readonly int $lecteur;

    /** L'agence où le lecteur est personnel actif, sous son profil actif ; `null` : il ne forme que son côté. */
    private readonly ?int $agence;

    /** @var list<int> le personnel de `$agence` (règle du tiers) */
    private readonly array $personnel;

    private readonly CarbonImmutable $maintenant;

    public function __construct(User $lecteur, ?CarbonInterface $maintenant = null)
    {
        $this->lecteur = (int) $lecteur->getKey();
        $this->agence = PersonnelDeLAgence::agencesOuPersonnelActif($lecteur)[0] ?? null;
        $this->personnel = $this->agence === null ? [] : self::personnelDe($this->agence);
        $this->maintenant = CarbonImmutable::instance($maintenant ?? now())->utc();
    }

    /**
     * Le personnel ACTIF d'une agence, au sens de {@see PersonnelDeLAgence::estPersonnel()} — joignable, et
     * profil d'agent ou d'administrateur actif, ou délégation de ces rôles en vigueur
     * (`MembershipCapabilityResolver::isStaffAt()`) — en UNE requête, avec les mêmes portées. Le test
     * `FileDuFilTest::test_le_personnel_en_liste_juge_comme_est_personnel` les confronte.
     *
     * @return list<int>
     */
    public static function personnelDe(int $agence): array
    {
        $roles = [AgencyRoleBaseType::Agent, AgencyRoleBaseType::AgencyAdmin];

        return User::query()
            ->whereNotIn('users.status', [UserStatus::Blocked->value, UserStatus::Deleted->value])
            ->where(function (EloquentBuilder $q) use ($roles, $agence) {
                foreach ($roles as $type) {
                    $classe = $type->profileClass();
                    $q->orWhereIn('users.id', $classe::query()->where('agency_id', $agence)->active()->select('user_id'));
                }
                $q->orWhereIn('users.id', RoleDelegation::query()
                    ->where('agency_id', $agence)
                    ->whereIn('role', array_map(fn (AgencyRoleBaseType $r) => $r->value, $roles))
                    ->enVigueur()
                    ->select('user_id'));
            })
            ->orderBy('users.id')
            ->pluck('users.id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Joint la file à une requête sur `conversations` (`boite.file`, `boite.snoozed_until`,
     * `boite.handled_at`, `boite.is_muted` ; avec `$details`, `boite.attend_depuis` et
     * `boite.en_attente_de`, que seule la page lit).
     */
    public function joindre(EloquentBuilder|QueryBuilder $conversations, bool $details = false): void
    {
        $conversations->leftJoinLateral($this->laterale($details), self::ALIAS);
    }

    /**
     * La page : la jointure, `conversations.*`, et les colonnes de la file sous des alias qui ne masquent
     * aucune colonne du modèle (`boite_*`), castées en dates.
     */
    public function selectionner(EloquentBuilder $conversations): void
    {
        $this->joindre($conversations, details: true);
        $a = self::ALIAS;
        $conversations
            ->select('conversations.*')
            ->addSelect([
                "{$a}.file as boite_file",
                "{$a}.snoozed_until as boite_snoozed_until",
                "{$a}.handled_at as boite_handled_at",
                "{$a}.attend_depuis as boite_attend_depuis",
                "{$a}.en_attente_de as boite_en_attente_de",
                // TCK-2971
                "{$a}.retard_depuis as boite_retard_depuis",
                "{$a}.engagement as boite_engagement",
            ])
            ->withCasts([
                'boite_snoozed_until' => 'datetime',
                'boite_handled_at' => 'datetime',
                'boite_attend_depuis' => 'datetime',
                'boite_en_attente_de' => 'array',
                'boite_retard_depuis' => 'datetime', // TCK-2971
                'boite_engagement' => 'array', // TCK-2971
            ]);
    }

    /** `filter[file]` : la jointure doit déjà être posée ({@see self::joindre()}). */
    public function filtrer(EloquentBuilder|QueryBuilder $conversations, string $file): void
    {
        $conversations->where(self::ALIAS.'.file', $file);
    }

    /**
     * L'ordre « dernier échange » : un rappel ÉCHU compte comme un échange à son échéance, et remonte donc
     * en tête à l'heure dite. Un rappel futur ne change rien à l'ordre (le fil est dans « Rappels »).
     *
     * Sous `filter[file]=vous` (`$file`), d'abord `attend_depuis` CROISSANT : celui qui attend depuis le plus
     * longtemps en tête (maquette `fil-boite` D) ; l'ordre « dernier échange » départage. Exige la jointure
     * détaillée ({@see self::selectionner()}). Les autres filtres gardent l'ordre « dernier échange ».
     * TCK-2971 — sous `filter[file]=retard`, d'abord `retard_depuis` CROISSANT (l'échéance dépassée la plus
     * ancienne).
     */
    public function ordonner(EloquentBuilder $conversations, ?string $file = null): void
    {
        $a = self::ALIAS;
        if ($file === self::VOUS) {
            $conversations->orderByRaw("{$a}.attend_depuis ASC NULLS LAST");
        }
        if ($file === self::RETARD) {
            $conversations->orderByRaw("{$a}.retard_depuis ASC NULLS LAST");
        }
        $conversations->orderByRaw(
            "GREATEST(conversations.last_message_at, CASE WHEN {$a}.snoozed_until <= ? THEN {$a}.snoozed_until END) DESC NULLS LAST",
            [$this->instant()],
        );
    }

    /**
     * Les comptes d'une requête déjà jointe, en colonnes d'un seul `SELECT` : `vous`, `attente`, `rappel`,
     * `retard`, et `gestes` (les fils `vous` ou `retard` hors sourdine ; TCK-2971 : chaque fil une fois, les
     * files étant exclusives — une seule colonne `file` par fil).
     */
    public function selectionnerLesComptes(QueryBuilder $conversations): void
    {
        $a = self::ALIAS;
        $conversations->selectRaw(
            "count(*) filter (where {$a}.file = 'vous') as vous,"
            ." count(*) filter (where {$a}.file = 'attente') as attente,"
            ." count(*) filter (where {$a}.file = 'rappel') as rappel,"
            ." count(*) filter (where {$a}.file = 'retard') as retard,"
            ." count(*) filter (where {$a}.file in ('vous', 'retard') and {$a}.is_muted = false) as gestes"
        );
    }

    /**
     * La sous-requête latérale. Trois niveaux : `f` lit les faits du lecteur (sa participation, le dernier
     * message compté, les événements), `g` les juge (quel côté, après « Traité » ?), et le niveau
     * extérieur rend la file. Chaque règle est UNE expression nommée, que son test retire par ablation.
     */
    private function laterale(bool $details): QueryBuilder
    {
        $r = $this->lecteur;
        $compte = $this->messageCompte('m');

        // Le dernier message compté du fil.
        $dernier = DB::table('messages as m')
            ->select('m.id', 'm.created_at', 'm.sender_id')
            ->whereColumn('m.conversation_id', 'lp.conversation_id')
            ->whereRaw($compte)
            ->orderByDesc('m.id')
            ->limit(1);

        $apresTraite = fn (string $instant): string => "(lp.handled_at IS NULL OR {$instant} > lp.handled_at)";

        // Les `event` qui attendent encore le lecteur, après « Traité » : l'instant du plus ancien.
        $evenementPourMoi = DB::table('messages')
            ->selectRaw('MIN(messages.created_at)')
            ->whereColumn('messages.conversation_id', 'lp.conversation_id')
            ->whereNull('messages.deleted_at')
            ->where(fn ($q) => NonLus::gesteToujoursAttenduDeLaColonne($q, "{$r}::bigint"))
            ->whereRaw($apresTraite('messages.created_at'));

        // Un `event` attend encore un AUTRE participant actif, après « Traité ».
        $evenementPourUnAutre = DB::table('conversation_participants as autre')
            ->selectRaw('1')
            ->whereColumn('autre.conversation_id', 'lp.conversation_id')
            ->whereNull('autre.left_at')
            ->where('autre.user_id', '<>', $r)
            ->whereExists($this->evenementAttendu('autre.user_id'));

        $equipe = $this->agence === null
            ? 'false'
            : 'COALESCE(('.EquipeDuFil::agenceSql('conversations').') = '.$this->agence.', false)';

        // Le fil est confié à quelqu'un d'autre que le lecteur, qui est personnel et participant actif.
        $confie = 'conversations.assigned_to_id IS NOT NULL'
            ." AND conversations.assigned_to_id <> {$r}"
            .' AND conversations.assigned_to_id = ANY('.$this->personnelSql().')'
            .' AND EXISTS (SELECT 1 FROM conversation_participants ap WHERE ap.conversation_id = conversations.id'
            .' AND ap.user_id = conversations.assigned_to_id AND ap.left_at IS NULL)';

        $faits = DB::table('conversation_participants as lp')
            ->leftJoinLateral($dernier, 'dm')
            ->select('lp.snoozed_until', 'lp.handled_at', 'lp.is_muted')
            ->selectRaw('dm.id as dernier_id, dm.created_at as dernier_at, dm.sender_id as dernier_auteur')
            ->selectRaw("{$equipe} as equipe")
            ->selectRaw("({$confie}) as confie")
            ->selectSub($evenementPourMoi, 'evt_moi_depuis')
            ->selectRaw('EXISTS ('.$evenementPourUnAutre->toSql().') as evt_autre', $evenementPourUnAutre->getBindings())
            ->whereColumn('lp.conversation_id', 'conversations.id')
            ->where('lp.user_id', $r)
            // Barrière d'optimisation : sans elle, PostgreSQL aplatit `f` dans `g` et recopie l'expression
            // de l'agence (`equipe`) à chaque emploi — trois évaluations par fil, mesurées par `EXPLAIN`.
            ->offset(0);

        // Le dernier message compté, après « Traité » (`f.handled_at`).
        $dernierApresTraite = 'f.dernier_id IS NOT NULL AND (f.handled_at IS NULL OR f.dernier_at > f.handled_at)';

        $jugement = DB::query()->fromSub($faits, 'f')
            ->select('f.*')
            ->selectRaw("({$dernierApresTraite} AND NOT ".$this->deMonCote('f.dernier_auteur', 'f').') as msg_autre')
            ->selectRaw("({$dernierApresTraite} AND ".$this->deMonCote('f.dernier_auteur', 'f').') as msg_moi')
            ->selectRaw('(f.equipe AND f.confie) as confie_autre')
            // TCK-2971 — l'échéance dépassée la plus ancienne d'un engagement en retard que le lecteur suit.
            ->selectSub($this->retardQueJeSuis(), 'retard_depuis');

        if ($details) {
            $jugement->selectSub($this->premierSansReponse(), 'msg_depuis');
        }

        $vous = '(g.msg_autre OR g.evt_moi_depuis IS NOT NULL)';

        $file = DB::query()->fromSub($jugement, 'g')
            ->select('g.snoozed_until', 'g.handled_at', 'g.is_muted', 'g.retard_depuis')
            ->selectRaw(
                "CASE WHEN g.snoozed_until > ? THEN 'rappel'"
                // TCK-2971 — `retard` prime sur `vous` ; « Traité » ne s'y applique pas.
                ." WHEN g.retard_depuis IS NOT NULL THEN 'retard'"
                ." WHEN {$vous} AND NOT g.confie_autre THEN 'vous'"
                ." WHEN g.msg_moi OR g.evt_autre OR ({$vous} AND g.confie_autre) THEN 'attente'"
                ." ELSE 'ajour' END as file",
                [$this->instant()],
            );

        if ($details) {
            $file->selectRaw('LEAST(g.msg_depuis, g.evt_moi_depuis) as attend_depuis');
            $attendus = $this->participantsAttendus();
            $file->selectRaw(
                "CASE WHEN {$vous} AND g.confie_autre THEN json_build_array(conversations.assigned_to_id)"
                .' ELSE ('.$attendus->toSql().') END as en_attente_de',
                $attendus->getBindings(),
            );
            // TCK-2971 — le plus pressant des engagements `open` du fil (en retard d'abord : l'échéance la plus
            // ancienne), pour tout lecteur du fil.
            $pressant = $this->engagementLePlusPressant();
            $file->selectRaw('('.$pressant->toSql().') as engagement', $pressant->getBindings());
        }

        return $file;
    }

    /**
     * TCK-2971 (ADR-0130 § 5) — `retard_depuis` : la plus ancienne échéance dépassée parmi les engagements
     * `open` du fil dont le porteur n'est PAS du côté du lecteur et que le lecteur SUIT (bénéficiaire, ou
     * personnel de l'agence du fil, `f.equipe`). Lit `f`. Aucune lecture de `handled_at`.
     */
    private function retardQueJeSuis(): QueryBuilder
    {
        return DB::table('commitments as ce')
            ->selectRaw('MIN(ce.due_at)')
            ->whereColumn('ce.conversation_id', 'conversations.id')
            ->where('ce.status', CommitmentStatus::Open->value)
            ->where('ce.due_at', '<', $this->instant())
            // Le côté : le porteur n'est pas du côté du lecteur (le porteur en retard est `vous`, TCK-2970).
            ->whereRaw('NOT '.$this->deMonCote('ce.holder_id', 'f'))
            // Que le lecteur suit : il en est le bénéficiaire, ou il est du personnel de l'agence du fil.
            ->whereRaw("(ce.beneficiary_id = {$this->lecteur} OR f.equipe)");
    }

    /** TCK-2971 — `{id, title, holder_id, due_at, etat}` de l'engagement `open` le plus pressant, ou `null`. */
    private function engagementLePlusPressant(): QueryBuilder
    {
        return DB::table('commitments as cp')
            ->selectRaw(
                "json_build_object('id', cp.id, 'title', cp.title, 'holder_id', cp.holder_id, 'due_at', cp.due_at,"
                ." 'etat', CASE WHEN cp.due_at < ? THEN 'late' ELSE 'open' END)",
                [$this->instant()],
            )
            ->whereColumn('cp.conversation_id', 'conversations.id')
            ->where('cp.status', CommitmentStatus::Open->value)
            ->orderBy('cp.due_at')
            ->orderBy('cp.id')
            ->limit(1);
    }

    /**
     * `attend_depuis` d'un fil `vous` par message : le PREMIER message compté de l'autre côté resté sans
     * réponse (postérieur au dernier message compté du côté du lecteur), après « Traité ». Lit `f`.
     */
    private function premierSansReponse(): QueryBuilder
    {
        $moi = DB::table('messages as mm')
            ->selectRaw('MAX(mm.id)')
            ->whereColumn('mm.conversation_id', 'conversations.id')
            ->whereRaw($this->messageCompte('mm'))
            ->whereRaw($this->deMonCote('mm.sender_id', 'f'));

        return DB::table('messages as ma')
            ->selectRaw('MIN(ma.created_at)')
            ->whereColumn('ma.conversation_id', 'conversations.id')
            ->whereRaw($this->messageCompte('ma'))
            ->whereRaw('NOT '.$this->deMonCote('ma.sender_id', 'f'))
            ->whereRaw('(f.handled_at IS NULL OR ma.created_at > f.handled_at)')
            ->whereRaw('ma.id > COALESCE(('.$moi->toSql().'), 0)', $moi->getBindings());
    }

    /**
     * `en_attente_de` d'un fil `attente` : les participants actifs autres que le lecteur qu'un `event` attend
     * encore (après « Traité »), et, quand le dernier message compté vient de son côté, ceux de l'autre côté.
     * Un tableau JSON trié. Lit `g`.
     */
    private function participantsAttendus(): QueryBuilder
    {
        $evenement = $this->evenementAttendu('q.user_id', 'g.handled_at');

        return DB::table('conversation_participants as q')
            ->selectRaw("COALESCE(json_agg(q.user_id ORDER BY q.user_id), '[]'::json)")
            ->whereColumn('q.conversation_id', 'conversations.id')
            ->whereNull('q.left_at')
            ->where('q.user_id', '<>', $this->lecteur)
            ->where(fn ($w) => $w
                ->whereRaw('(g.msg_moi AND NOT '.$this->deMonCote('q.user_id', 'g').')')
                ->orWhereExists($evenement));
    }

    /** Un `event` du fil, non supprimé, qui attend encore `$colonne`, postérieur à « Traité ». */
    private function evenementAttendu(string $colonne, string $traite = 'lp.handled_at'): QueryBuilder
    {
        return DB::table('messages')
            ->selectRaw('1')
            ->whereColumn('messages.conversation_id', 'conversations.id')
            ->whereNull('messages.deleted_at')
            ->where(fn ($q) => NonLus::gesteToujoursAttenduDeLaColonne($q, $colonne))
            ->whereRaw("({$traite} IS NULL OR messages.created_at > {$traite})");
    }

    /** Le prédicat « message compté » sur l'alias `$m` : sans liaison, valeurs des enums du dépôt. */
    private function messageCompte(string $m): string
    {
        return "{$m}.deleted_at IS NULL"
            ." AND {$m}.visibility = '".MessageVisibility::All->value."'"
            ." AND {$m}.type NOT IN ('".MessageType::System->value."', '".MessageType::Event->value."')";
    }

    /**
     * `$colonne` (un compte) est-il du côté du lecteur ? L'équipe quand le lecteur en est dans ce fil
     * (`{$niveau}.equipe`), sinon le lecteur seul. Un auteur nul (compte effacé) est de l'autre côté.
     */
    private function deMonCote(string $colonne, string $niveau): string
    {
        $seul = "{$colonne} = {$this->lecteur}";
        if ($this->agence === null) {
            return "COALESCE({$seul}, false)";
        }

        return "COALESCE(CASE WHEN {$niveau}.equipe THEN {$colonne} = ANY(".$this->personnelSql().") ELSE {$seul} END, false)";
    }

    /** Le personnel de l'agence du lecteur en tableau PostgreSQL d'entiers. */
    private function personnelSql(): string
    {
        return "'{".implode(',', array_map('intval', $this->personnel))."}'::bigint[]";
    }

    private function instant(): string
    {
        return $this->maintenant->format('Y-m-d H:i:s');
    }
}
