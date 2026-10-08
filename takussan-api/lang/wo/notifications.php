<?php

return [

    'salutation' => 'Ekip Takussan',

    // TCK-249 — Invitation lifecycle emails (Wolof).
    'invitation' => [
        'subject' => 'Am nga invitation Takussan',
        'reminder_subject' => 'Tee — invitation Takussan',
        'greeting' => 'Asalaa Maalekum,',
        'intro' => 'Wax nañu la nga bokk Takussan ni :role.',
        'reminder_intro' => 'Buñ la fàttali: invitation Takussan bi nga jot ni :role mu ngi xaar.',
        'action' => 'Nangu invitation bi',
        'expires_at' => 'Lëkkalekaay bii dafay jeex ci :date.',
        'ignore' => 'Soo xamul invitation bi, mën nga ko bañ.',
    ],

    'invitation_accepted' => [
        'subject' => ':email nangu na sa invitation',
        'greeting' => 'Asalaa Maalekum,',
        'intro' => ':email nangu na sa invitation mu bokk Takussan ni :role.',
    ],

    'invitation_expired' => [
        'subject' => 'Invitation bi nga yónni :email jeex na',
        'greeting' => 'Asalaa Maalekum,',
        'intro' => 'Invitation bi nga yónni :email jeex na sa nguñu ko nangu.',
        'advice' => 'Mën nga ko yónniwaat ci sa table de bord.',
    ],

    'registration' => [
        'subject' => 'Dëggël sa adrees e-mail',
        'greeting' => 'Dalal ak jàmm ci Takussan !',
        'intro' => 'Soo bëggee dëggël sa adrees e-mail, bëgg na nga toppël buton bi ci suuf.',
        'action' => 'Dëggël e-mail',
        'expire' => 'Lënk bi di na faat ci :count minit.',
        'ignore' => 'Soo xamul dara ci kayit gii, bul fàtte lu ko moy.',
    ],

    'password_reset' => [
        'subject' => 'Soppi sa baatu jàng (mot de passe)',
        'greeting' => 'Salaam !',
        'intro' => 'Jot nga kayit gii ndax ñu ne ñu soppi sa baatu jàng.',
        'action' => 'Soppi baatu jàng',
        'expire' => 'Lënk bi di na faat ci :count minit.',
        'ignore' => 'Soo ñuulul soppi baatu jàng, bul dara def.',
    ],

    'new_booking' => [
        'subject' => 'Reservation bu bees #:reference',
        'greeting' => 'Salaam,',
        'intro' => 'Sa reservation #:reference doon na bind ak di xaaru ngir muccal ko.',
        'details' => 'Bërëb : li dale ci :start ba :end.',
        'sms' => 'Takussan : sa reservation #:reference dafa di xaar muccal. Bërëb li dale ci :start ba :end.',
    ],

    'digest' => [
        'subject' => 'Ñu seetlu Takussan (:count yu bees)',
        'greeting' => 'Salaam,',
        'intro' => 'Lii mooy àq-àq yi nga jot ca demba.',
        'footer' => 'Gis senter bu notifications ngir gis sa yëkkati yépp.',
        'see_all' => 'Gis notifications yépp',
        'unsubscribe' => 'Yëgël ci kanam bu digest',
    ],

    'types' => [
        'booking' => 'Réservations',
        'payment' => 'Paiements',
        'lease' => 'Baux',
        'maintenance' => 'Maintenance',
        'visit' => 'Visites',
        'message' => 'Messages',
        'system' => 'Système',
        'bank_statement_imported' => 'Relevé bancaire importé',
        'bank_statement_finalized' => 'Relevé bancaire clôturé',
        // TCK-588 — les trois types de délégation manquaient (repli anglais).
        'role_delegated' => 'Ndawal dencukaay',
        'role_delegation_expired' => 'Ndawal bu jeex',
        'role_delegation_revoked' => 'Ndawal bu ñu dindi',
    ],

    'task_due_reminder' => [
        'subject' => 'Fàttalikuwaay : ligéey bi nag — :title',
        'greeting' => 'Salaam,',
        'intro' => 'Sa ligéey « :title » dafa wàcc ëllëg ci :datetime.',
    ],

    'lease_late_fee_applied' => [
        'subject' => 'Penalité di yengul ñu ko teg ci paye :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Penalité di yengul bu :amount, ñu ko teg ci paye :reference.',
        'details' => 'Ñu ko jeem ci :percent % bi des ci montant bi (:base).',
        // TCK-593 — ce que dit la notification est ce que dit l'écran (`late_fee_payable_online`).
        'pay_online' => 'Dinañu ko yokk ci xaalis bi ngay fey ci internet.',
        'pay_at_agency' => 'Ci sa ajaans nga koy fey ; duñu ko laaj bu ngay fey ci internet.',
    ],

    'account_deletion_requested' => [
        'subject' => 'Ndogalu suufeel kont nañ ko jaaxal',
        'greeting' => 'Salaam,',
        'intro' => 'Jot nañu sa ndogalu suufeel kont. Dina jaarukoo ci :date.',
        'consequences' => 'Sa donné personnel ya, dañ leen di anonimiser sax-sax. Donné yu jaadu ag téé yi (paye, bail, fakture) dañ leen di kàllaaxoo waaye sànni leen sa tur.',
        'action' => 'Aju ndogal li',
        'ignore' => 'Bu yaa ko sàppal-li, aju ko leegi te soppi sa baatu jubaale.',
    ],

    // TCK-272 — kod bu step-up ngir kont yu amul baatu jubaale bu baax.
    'account_deletion_step_up' => [
        'subject' => 'Sa kod bu dëggal suufeelu kont bi',
        'greeting' => 'Salaam,',
        'intro' => 'Kod bii ngay bind ngir dëggal suufeelu sa kont :',
        'expires' => 'Kod bii dina dox :minutes simili te benn yoon rekk lañu ko mëna jëfandikoo.',
        'ignore' => 'Bu yaa ko sàppal-li, bàyyil e-mail bii : su amul kod bii, dara du suufeel.',
    ],

    'account_deletion_reminder' => [
        'subject' => 'Faalewu : suufeel kont ci :days fan',
        'greeting' => 'Salaam,',
        'intro' => 'Sa kont di nañu ko suufeel ci :days fan, ci :date. Soo soppee xel, manga ko aju ba leegi.',
        'action' => 'Aju ndogal li',
        'ignore' => 'Soo dëggee suufeel bi, ñakkul wax dara.',
    ],

    'account_deletion_executed' => [
        'subject' => 'Sa kont suufeel nañ ko',
        'greeting' => 'Salaam,',
        'intro' => 'Sa kont Takussan suufeel nañ ko, te sa donné personnel anonimiser nañ leen sax-sax.',
        'retention' => 'Naka noonu mu nekke ci yoonu réew, doxal yi nu mëniw (paye, fakture) lañ kàllaaxoo waaye anonim ci 10 at.',
        'contact' => 'Yoonu sa laaj, jokkok ekipu jëfundikuwaay ya.',
    ],

    'conversation_invite' => [
        'subject' => 'Wax bi : :subject',
        'greeting' => 'Salaam,',
        'intro' => ':inviter dafa la wëlbati ci kuréel bu : « :subject ».',
    ],

    'lease_deposit_refunded' => [
        'subject' => 'Delloo kaution — luwé :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Sa kaution ci luwé :reference, delloo nañ la — :amount.',
        'retention' => 'Téye nañ :amount. Mboor : :reason.',
    ],

    'lease_renewed' => [
        'subject' => 'Sa luwé yeesalaat nañ ko — :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Avenant am na ci sa luwé (:reference). Conditions yu bees yi tàmbali nañ.',
        'period' => 'Période : :start ba :end.',
    ],

    // TCK-265 — one-shot welcome notification fired on Lease.activated.
    'tenant_welcome' => [
        'subject' => 'Dalal jàmm ci sa kër — luwé :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Sa luwé :reference jàppal na léegi.',
        'body' => 'Xool sa fey yi di ñëw, laaj nañu maintenance ak feeg sa documents ci sa espas waa-kër.',
        'action' => 'Ubbi sama espas waa-kër',
    ],

    // TCK-266 — J+7 reminder when the move-in inventory is still unsigned.
    'tenant_inventory_reminder' => [
        'subject' => 'Faatu — état des lieux war ngaa ko shign (luwé :reference)',
        'greeting' => 'Salaam,',
        'intro' => 'État des lieux bu sa luwé :reference signe nañ ko ba léegi.',
        'body' => 'Ba kerig dossier bi am, war ngaa shigne ko. Dugu ci sa espas waa-kër ngir mottali shignal bi.',
        'action' => 'Shigne état des lieux',
    ],

    'agent_tenant_inventory_reminder' => [
        'subject' => 'Waa-kër bu yegg ci EDL — luwé :reference',
        'greeting' => 'Salaam,',
        'intro' => ':tenant signe wuñu état des lieux entrée bu luwé :reference (lu ëpp 7 fan).',
        'body' => 'Xoolal ak waa-kër bi su fekk dañu ko war di gungé ngir mottali signe bi.',
        'action' => 'Xool onboardings yi yagg',
        'unknown_tenant' => 'Waa-kër bi',
    ],

    'lease_early_termination' => [
        'greeting' => 'Salaam,',
        'penalty_line' => 'Pénalité tas bu jëkk : :amount. War ngaa fey ko bala bisu njëlbeen bi.',
        'requested' => [
            'subject' => 'Tas bu jëkk laaj — luwé :reference',
            'intro' => 'Tas bu jëkk laaj nañ ko ci luwé :reference. Bisu njëlbeen : :date.',
        ],
        'cancelled' => [
            'subject' => 'Tas bu jëkk neenal — luwé :reference',
            'intro' => 'Tas bu jëkk laaj bi (luwé :reference) neenal nañ ko. Luwé bi des ci jàpp.',
        ],
        'confirmed' => [
            'subject' => 'Luwé jeex na — :reference',
            'intro' => 'Luwé :reference jeex na — bisu :date.',
        ],
    ],

    'lease_rent_reviewed' => [
        'subject' => 'Yeesalaat layeer — luwé :reference',
        'greeting' => 'Salaam,',
        'intro' => 'Layeer mensuel bu luwé :reference yeesalaat nañ ko : :old → :new.',
        'effective' => 'Bisu njëlbeen : :date.',
        'reason' => 'Mboor : :reason',
    ],

    'invoice_reminder_sent' => [
        'subject' => 'Faalewu — fakture :reference dafa yengul',
        'greeting' => 'Salaam,',
        'intro' => 'Fakture :reference yengul na :days fan (échéance : :due_date).',
        'amount' => 'Mbooloom dëgg : :amount.',
        'cta' => 'Bëgg na nga fey ko ba leegi ngir bañ jot beneen faalewu.',
    ],

    'booking_expired' => [
        'subject' => 'Laaj reservation #:reference dafa faat',
        'greeting' => 'Salaam,',
        'intro' => 'Sa laaj reservation #:reference ci :property dafa faat.',
        'expired_reason' => 'Laaj bi dafa baña am xalu lu ko jàpp ci diiwaan bi agence bi teg.',
        'next_steps' => 'Moo man laa laaj waat bu bees su dëkku bi dafa am.',
        'unknown_property' => 'Dëkku bu xamul',
    ],

    'threshold_alert' => [
        'title' => 'Yëgle KPI — :metric',
    ],

    // TCK-575 — e-mail bu export RGPD pare (xoolal fichier fr bi).
    'data_export_ready' => [
        'subject' => 'Sa génne xibaar pare na',
        'greeting' => 'Salaam,',
        'intro' => 'Sa arsiib portabilité Takussan pare na.',
        'action' => 'Ubbi « Samay xibaar »',
        'expires' => '{1} Mën nga ko wàcce ci xët woowu diirub :count fan.|[2,*] Mën nga ko wàcce ci xët woowu diirub :count fan.',
    ],

    // TCK-588 — alertes administrateur (canaux Slack, Discord, e-mail de l'exploitant).
    'admin_alert' => [
        'test_message' => '[TEST] :event tàmbali na ndax test synthétique.',
        'activity_message' => ':event — jëfekat :actor, mbir :subject',
    ],

    // TCK-588 — salutation et bouton des e-mails rendus par code (CodedNotification).
    'greeting' => 'Salaam aleekum,',
    'open' => 'Ubbi',

    // TCK-588 (ADR-0032) — une notification est un CODE rendu par surface dans la langue du destinataire : `codes.<code>.<surface>` (title, body, sms ; mail_subject/mail_body retombent sur title/body ; `_link` quand le lien de paiement est fourni). LangGroupParityTest garde les trois langues.
    'codes' => [
        'impersonation' => [
            'ended' => [
                'title' => 'Ekibu Takussan seet na sa kont',
                'body' => 'Benn ci ekibu Takussan, :operator, seet na sa kont te soppiwul dara, li dale :started_at ba :ended_at. Lu ko waral : :reason. Defuñu dara ci sa tur.',
                'sms' => 'Takussan : sunu ekib seet na sa kont te soppiwul dara (:operator). Xoolal sa yëgle yi.',
            ],
        ],
        'agency' => [
            'suspended' => [
                'title' => 'Ajans bi taxawal nañu ko : :agency',
                'body' => 'Platform bi taxawal na ajans :agency. Lu ko waral : :reason. Ay yéenekaayam feeñatul te mënuñu soppi dara ci béréb bi.',
                'sms' => 'Takussan : ajans :agency taxawal nañu ko. Ay yéenekaayam dindi nañu leen ci site bi.',
            ],
            'reinstated' => [
                'title' => 'Taxawal gi dindi nañu ko : :agency',
                'body' => 'Taxawal gu ajans :agency dindi nañu ko. Lu ko waral : :reason. Ay yéenekaayam feeñ nañu ci kaw.',
                'sms' => 'Takussan : taxawal gu :agency dindi nañu ko.',
            ],
        ],
        'platform_operator' => [
            'revoked' => [
                'title' => 'Operatëer bi dindi nañu ko : :operator',
                'body' => 'Dindi nañu :operator ci konsol platform bi. Lu ko waral : :reason.',
                'sms' => 'Takussan : :operator amatul konsol bi.',
            ],
        ],
        'lease_payment' => [
            'due_soon' => [
                'title' => 'Pey kër bi ngir :due_date',
                'body' => 'Sa pey kër bu :amount ngir :property, war nga koo fey ci :due_date.',
                'body_link' => 'Sa pey kër bu :amount ngir :property, war nga koo fey ci :due_date. Fey ci internet : :payment_url',
                'sms' => 'Takussan : pey kër bu :amount, fey ko ci :due_date (:property).',
                'sms_link' => 'Takussan : pey kër bu :amount, fey ko ci :due_date. Fey : :payment_url',
            ],
            'overdue' => [
                'title' => 'Pey kër bi yàgg na',
                'body' => 'Sa pey kër bu :amount ngir :property, bu waroon a fey ci :due_date, yàgg na :days fan.',
                'body_link' => 'Sa pey kër bu :amount ngir :property, bu waroon a fey ci :due_date, yàgg na :days fan. Fey ci internet : :payment_url',
                'sms' => 'Takussan : pey kër bu :amount yàgg na :days fan (:property).',
                'sms_link' => 'Takussan : pey kër bu :amount yàgg na :days fan. Fey : :payment_url',
            ],
            'overdue_landlord' => [
                'title' => 'Pey kër bu ñu feyul : :property',
                'body' => 'Pey kër bu :amount bu :tenant ngir :property yàgg na :days fan.',
                'sms' => 'Takussan : pey kër bu :amount bu :tenant (:property) yàgg na :days fan.',
            ],
            'overdue_digest' => [
                'title' => ':count pey kër yu yàgg',
                'body' => ':count pey kër ci say bail yàgg nañu, mépp lépp :total.',
                'sms' => 'Takussan : :count pey kër yu yàgg (:total).',
            ],
            'recorded' => [
                'title' => 'Fey bi bind nañu ko',
                'body' => 'Sa fey bu :amount ngir :property bind nañu ko.',
                'sms' => 'Takussan : fey bu :amount bind nañu ko (:property).',
            ],
            'received_landlord' => [
                'title' => 'Pey kër bi agsi na : :property',
                'body' => ':tenant fey na :amount ngir :property.',
                'sms' => 'Takussan : :tenant fey na :amount (:property).',
            ],
        ],
        // TCK-593 — un double encaissement à rembourser, signalé aux admins de l'agence.
        'payment' => [
            'duplicate' => [
                'title' => 'Fey bi ñu ko jot ñaari yoon',
                'body' => 'Fey ci internet bu :amount agsi na ngir :reference, te fey nañu ko ba noppi. Delloo ko ki fey walla jox ko beneen.',
                'sms' => 'Takussan : fey bu :amount agsi na ñaari yoon ngir :reference. Delloo ko walla jox ko beneen.',
            ],
            'duplicate_late_fee' => [
                'title' => 'Pénalité bi ñu ko jot ñaari yoon',
                'body' => 'Pénalité bu :amount ngir :reference, bu ñu fey ba noppi ci agence bi, ñu jot na ko itam ci internet. Delloo ko ki fey walla jox ko beneen.',
                'sms' => 'Takussan : pénalité bu :amount agsi na ñaari yoon ngir :reference. Delloo ko walla jox ko beneen.',
            ],
        ],
        'booking' => [
            'created' => [
                'title' => 'Réservation bu bees',
                'body' => 'Ñu laaj na réservation :reference ngir :property, li dale :start_date ba :end_date.',
                'sms' => 'Takussan : réservation bu bees :reference (:property).',
            ],
            'confirmed' => [
                'title' => 'Réservation bi dëggal nañu ko',
                'body' => 'Sa réservation :reference ngir :property, li dale :start_date ba :end_date, dëggal nañu ko.',
                'sms' => 'Takussan : réservation :reference dëggal nañu ko (:property, :start_date).',
            ],
            'rejected' => [
                'title' => 'Réservation bi gàntu nañu ko',
                'body' => 'Sa réservation :reference ngir :property, gàntu nañu ko.',
                'sms' => 'Takussan : réservation :reference gàntu nañu ko (:property).',
            ],
            'cancelled' => [
                'title' => 'Réservation bi neenal nañu ko',
                'body' => 'Sa réservation :reference ngir :property, neenal nañu ko.',
                'sms' => 'Takussan : réservation :reference neenal nañu ko (:property).',
            ],
        ],
        // TCK-589 — invitation adressée à un numéro : le nom de l'agence seul, jamais un texte de l'invitant.
        'invitation' => [
            'received' => [
                'title' => 'Woote bu :agency',
                'body' => ':agency dafa la woo nga bokk ci ekibam.',
                'sms' => 'Takussan : :agency dafa la woo nga bokk ci ekibam. Nangul fii : :url',
            ],
            'reminder' => [
                'title' => 'Fàttali : woote bu :agency',
                'body' => 'Sa woote ngir bokk ci :agency ngi lay xaar.',
                'sms' => 'Takussan : fàttali — sa woote ngir bokk ci :agency ngi lay xaar : :url',
            ],
        ],
        // TCK-589 p3-1 — avis à l'ANCIEN numéro remplacé, et au compte. Aucun numéro dans le texte.
        'account' => [
            'phone_changed' => [
                'title' => 'Nimero telefon bi soppi nañu ko',
                'body' => 'Nimero telefon bu ñu dëggal ci sa kont, soppi nañu ko. Su dul yow, jokkoo ak support bi.',
                'sms' => 'Takussan : nimero bii du nimero sa kont kenn. Su dul yow moo ko soppi, jokkoo ak support bi.',
            ],
            'blocked' => [
                'title' => 'Sa kont tëj nañu ko',
                'body' => 'Platform bi tëj na sa kont Takussan. Lu ko waral : :reason. Jokkool ak support bi su la soxlaa.',
                'sms' => 'Takussan : sa kont tëj nañu ko. Jokkool ak support bi.',
            ],
            'reactivated' => [
                'title' => 'Sa kont ubbi nañu ko',
                'body' => 'Sa kont Takussan ubbi nañu ko. Lu ko waral : :reason. Mën nga dugg ci kaw.',
                'sms' => 'Takussan : sa kont ubbi nañu ko.',
            ],
        ],
        'visit' => [
            'reminder' => [
                'title' => 'Fàttali seetlu : :property',
                'body' => 'Fàttali : seetlu :property mu ngi ci :scheduled_at.',
                'sms' => 'Takussan : seetlu :property ci :scheduled_at.',
            ],
            'requested' => [
                'title' => 'Laaj seetaan : :property',
                'body' => 'Waxtu bi ñu laaj : :scheduled_at. Ngir jokkoo ak ki bëgg seetaan : :contact.',
                'mail_body' => "Am na ku laaj seetaan :property.\nWaxtu bi ñu laaj : :scheduled_at (waxtu :timezone).\nNgir jokkoo ak ki bëgg seetaan : :contact.",
                'sms' => 'Takussan : laaj seetaan ngir :property ci :scheduled_at (:timezone).',
            ],
            'rescheduled_by_visitor' => [
                'title' => 'Beneen waxtu : :property',
                'body' => 'Ki bëgg seetaan joxe na :scheduled_at. Seetaan bi dafay xaar nga dëggal ko.',
                'mail_body' => "Ki bëgg seetaan :property joxe na beneen waxtu. Seetaan bi dafay xaar nga dëggal ko.\nWaxtu bi mu joxe : :scheduled_at (waxtu :timezone).",
                'sms' => 'Takussan : ki bëgg seetaan joxe na :scheduled_at (:timezone) ngir :property.',
            ],
            'cancelled_by_visitor' => [
                'title' => 'Ki bëgg seetaan neenal na : :property',
                'body' => 'Ki bëgg seetaan neenal na seetaan bu waroon am ci :scheduled_at.',
                'mail_body' => "Ki bëgg seetaan neenal na seetaanu :property.\nWaroon na am ci :scheduled_at (waxtu :timezone).",
                'sms' => 'Takussan : ki bëgg seetaan neenal na seetaanu :property ci :scheduled_at (:timezone).',
            ],
            'confirmed' => [
                'title' => 'Seetaan dëggal nañu ko : :property',
                'body' => 'Sa seetaanu :property dëggal nañu ko ci :scheduled_at.',
                'mail_body' => "Sa laaju seetaan ngir :property dëggal nañu ko.\nWaxtu bi : :scheduled_at (waxtu :timezone).",
                'sms' => 'Takussan : sa seetaanu « :property » dëggal nañu ko ci :scheduled_at (:timezone).',
            ],
            'rescheduled' => [
                'title' => 'Waxtu seetaanu :property soppiku na',
                'body' => 'Waxtu bu bees : :scheduled_at.',
                'mail_body' => "Ajaans bi toxal na sa seetaanu :property.\nWaxtu bu bees : :scheduled_at (waxtu :timezone).",
                'sms' => 'Takussan : sa seetaanu « :property » toxal nañu ko ci :scheduled_at (:timezone).',
            ],
            'cancelled' => [
                'title' => 'Sa seetaanu :property neenal nañu ko',
                'body' => 'Seetaan bu waroon am ci :scheduled_at neenal nañu ko.',
                'mail_body' => "Ajaans bi neenal na sa seetaanu :property.\nWaroon na am ci :scheduled_at (waxtu :timezone).",
                'sms' => 'Takussan : sa seetaanu « :property » bu waroon am ci :scheduled_at (:timezone), neenal nañu ko.',
            ],
        ],
        'message' => [
            'received' => [
                'title' => 'Bataaxal bu bees bu :sender',
                'body' => ':sender : :excerpt',
                'sms' => 'Takussan : bataaxal bu bees bu :sender.',
            ],
        ],
        'lead' => [
            'received' => [
                'title' => 'Laaj bu bees bu :name — :contact',
                'body' => ':name (:contact) : :message',
                'sms' => 'Takussan : laaj bu bees bu :name.',
            ],
            'acknowledged' => [
                'title' => 'Sa laaj agsi na',
                'body' => 'Sa laaj ci « :about » yónne nañu ko. Dinañu la tontu ci lu gaaw, ci telefon walla ci e-mail.',
                'sms' => 'Takussan : sa laaj ci :about yónne nañu ko.',
            ],
        ],
        'kyc' => [
            'submitted' => [
                'title' => 'KYC agence bu ñu war a seet',
                'body' => 'Dossier KYC bu :agency yónne nañu ko.',
                'sms' => 'Takussan : KYC bu :agency war nañu ko seet.',
            ],
            'verified' => [
                'title' => 'KYC agence bi baax na',
                'body' => 'Sa dossier KYC seet nañu ko, baax na.',
                'sms' => 'Takussan : sa dossier KYC baax na.',
            ],
            'rejected' => [
                'title' => 'KYC agence bi gàntu nañu ko',
                'body' => 'Sa dossier KYC gàntu nañu ko : :reason',
                'sms' => 'Takussan : sa dossier KYC gàntu nañu ko.',
            ],
        ],
        'role_delegation' => [
            'activated' => [
                'title' => 'Ndawal dencukaay — :role',
                'body' => 'Jot nga ndawal :role ba :ends_at.',
                'sms' => 'Takussan : jot nga :role ba :ends_at.',
            ],
            'activated_delegator' => [
                'title' => 'Ndawal dencukaay — :role',
                'body' => 'Ndawal :role bi nga jox :beneficiary tàmbali na.',
                'sms' => 'Takussan : ndawal :role ngir :beneficiary tàmbali na.',
            ],
            'expired' => [
                'title' => 'Ndawal bi jeex na — :role',
                'body' => 'Sa ndawal ngir :role jeex na.',
                'sms' => 'Takussan : ndawal :role jeex na.',
            ],
            'expired_delegator' => [
                'title' => 'Ndawal bi jeex na — :role',
                'body' => 'Ndawal :role bi nga jox :beneficiary jeex na.',
                'sms' => 'Takussan : ndawal :role ngir :beneficiary jeex na.',
            ],
            'revoked' => [
                'title' => 'Ndawal bi dindi nañu ko — :role',
                'body' => 'Sa ndawal ngir :role dindi nañu ko.',
                'sms' => 'Takussan : ndawal :role dindi nañu ko.',
            ],
            'revoked_delegator' => [
                'title' => 'Ndawal bi dindi nañu ko — :role',
                'body' => 'Dindi nga ndawal :role bi nga joxoon :beneficiary.',
                'sms' => 'Takussan : ndawal :role bu :beneficiary dindi nañu ko.',
            ],
        ],
        'bank_statement' => [
            'imported' => [
                'title' => 'Relevé bi dugg na',
                'body' => 'Sa relevé :bank (:lines rëdd) pare na ngir rapprochement.',
                'sms' => 'Takussan : relevé :bank dugg na.',
            ],
            'finalized' => [
                'title' => 'Relevé bi tëj nañu ko',
                'body' => 'Relevé bi dale :period_start ba :period_end tëj nañu ko (:confirmed/:total rëdd yu ñu rapprocher).',
                'sms' => 'Takussan : relevé :period_start ba :period_end tëj nañu ko.',
            ],
        ],
        'maintenance' => [
            'created' => [
                'title' => 'Laaj bu bees ngir defar',
                'body' => 'Ñu yónne na laaj ngir defar (:reference) ci :property.',
                'sms' => 'Takussan : laaj ngir defar :reference (:property).',
            ],
            'assigned' => [
                'title' => 'Liggéey bu bees : :request',
                'body' => 'Jox nañu la benn liggéey ci :property. Nangu ko walla bañ ko ci xëtam.',
                'sms' => 'Takussan : Liggéey bu bees : :request',
            ],
            'unassigned' => [
                'title' => 'Liggéey bi jële nañu ko : :request',
                'body' => 'Liggéey bi « :request » jotatuloo ko.',
                'sms' => 'Takussan : Liggéey bi jële nañu ko : :request',
            ],
            'accepted' => [
                'title' => 'Liggéey bi nangu nañu ko : :request',
                'body' => ':provider nangu na liggéey bi « :request ».',
                'sms' => 'Takussan : Liggéey bi nangu nañu ko : :request',
            ],
            'declined' => [
                'title' => 'Liggéey bi bañ nañu ko : :request',
                'body' => ':provider bañ na liggéey bi « :request ». Lu tax : :reason',
                'sms' => 'Takussan : Liggéey bi bañ nañu ko : :request',
            ],
            'completed' => [
                'title' => 'Liggéey bi jeex na : :request',
                'body' => 'Prestataire bi jeexal na liggéey bi « :request ». Ki laaj war na wóoral ne defar nañu ko.',
                'sms' => 'Takussan : Liggéey bi jeex na : :request',
            ],
            'confirmed' => [
                'title' => 'Defar bi wóor na : :request',
                'body' => 'Ki laaj wóoral na defar bi : liggéey bi « :request » tëj nañu ko.',
                'sms' => 'Takussan : Defar bi wóor na : :request',
            ],
            'contested' => [
                'title' => 'Defar bi ñu ngi koy weddi : :request',
                'body' => 'Jafe-jafe bi des na ci « :request ». Kàddu : :comment',
                'sms' => 'Takussan : Defar bi ñu ngi koy weddi : :request',
            ],
            'auto_closed' => [
                'title' => 'Liggéey bi tëj nañu ko : :request',
                'body' => 'Ndax tontu amul ci :days fan, liggéey bi « :request » tëju na ci boppam.',
                'sms' => 'Takussan : Liggéey bi tëj nañu ko : :request',
            ],
            'cancelled' => [
                'title' => 'Liggéey bi neenal nañu ko : :request',
                'body' => 'Liggéey bi « :request » neenal nañu ko.',
                'sms' => 'Takussan : Liggéey bi neenal nañu ko : :request',
            ],
            'step_acknowledged' => [
                'title' => 'Sa laaj « :request » : jot nañu ko',
                'body' => 'Sa laaj liggéey léegi mungi : jot nañu ko.',
                'sms' => 'Takussan : Sa laaj « :request » : jot nañu ko',
            ],
            'step_assigned' => [
                'title' => 'Sa laaj « :request » : jox nañu ko ku koy def',
                'body' => 'Sa laaj liggéey léegi mungi : jox nañu ko ku koy def.',
                'sms' => 'Takussan : Sa laaj « :request » : jox nañu ko ku koy def',
            ],
            'step_in_progress' => [
                'title' => 'Sa laaj « :request » : liggéey bi dafa ndeyi',
                'body' => 'Sa laaj liggéey léegi mungi : liggéey bi dafa ndeyi.',
                'sms' => 'Takussan : Sa laaj « :request » : liggéey bi dafa ndeyi',
            ],
            'step_completed' => [
                'title' => 'Sa laaj « :request » : liggéey bi jeex na',
                'body' => 'Sa laaj liggéey léegi mungi : liggéey bi jeex na.',
                'sms' => 'Takussan : Sa laaj « :request » : liggéey bi jeex na',
            ],
            'step_closed' => [
                'title' => 'Sa laaj « :request » : tëj nañu ko',
                'body' => 'Sa laaj liggéey léegi mungi : tëj nañu ko.',
                'sms' => 'Takussan : Sa laaj « :request » : tëj nañu ko',
            ],
            'step_cancelled' => [
                'title' => 'Sa laaj « :request » : neenal nañu ko',
                'body' => 'Sa laaj liggéey léegi mungi : neenal nañu ko.',
                'sms' => 'Takussan : Sa laaj « :request » : neenal nañu ko',
            ],
            'step_acknowledged_scheduled' => [
                'title' => 'Sa laaj « :request » : jot nañu ko',
                'body' => 'Sa laaj liggéey léegi mungi : jot nañu ko. Prestataire bi dina ñëw ci :scheduled_at.',
                'sms' => 'Takussan : Sa laaj « :request » : jot nañu ko',
            ],
            'step_assigned_scheduled' => [
                'title' => 'Sa laaj « :request » : jox nañu ko ku koy def',
                'body' => 'Sa laaj liggéey léegi mungi : jox nañu ko ku koy def. Prestataire bi dina ñëw ci :scheduled_at.',
                'sms' => 'Takussan : Sa laaj « :request » : jox nañu ko ku koy def',
            ],
            'step_in_progress_scheduled' => [
                'title' => 'Sa laaj « :request » : liggéey bi dafa ndeyi',
                'body' => 'Sa laaj liggéey léegi mungi : liggéey bi dafa ndeyi. Prestataire bi dina ñëw ci :scheduled_at.',
                'sms' => 'Takussan : Sa laaj « :request » : liggéey bi dafa ndeyi',
            ],
        ],
        'maintenance_quote' => [
            'requested' => [
                'title' => 'Laaj devis : :request',
                'body' => 'Ñu ngi lay laaj devis ngir liggéey bi « :request ».',
                'sms' => 'Takussan : laaj devis ngir « :request ».',
            ],
            'submitted' => [
                'title' => 'Devis bi yónne nañu ko : :request',
                'body' => 'Devis bu :amount yónne nañu ko ngir liggéey bi « :request ».',
                'sms' => 'Takussan : devis bu :amount ngir « :request ».',
            ],
            'approved' => [
                'title' => 'Devis bi nangu nañu ko : :request',
                'body' => 'Sa devis ngir liggéey bi « :request » nangu nañu ko.',
                'sms' => 'Takussan : devis ngir « :request » nangu nañu ko.',
            ],
            'rejected' => [
                'title' => 'Devis bi gàntu nañu ko : :request',
                'body' => 'Sa devis ngir liggéey bi « :request » gàntu nañu ko. Lu tax : :reason',
                'sms' => 'Takussan : devis ngir « :request » gàntu nañu ko.',
            ],
            'awaiting_owner' => [
                'title' => 'Sa ndigal la ñuy xaar : :request',
                'body' => 'Benn devis bu :amount ngir « :request » ëpp na plafond bi nga déggoo ak sa agence. Nangu ko walla bañ ko.',
                'sms' => 'Takussan : Sa ndigal la ñuy xaar : :request',
            ],
        ],
        'prospect_match' => [
            'digest' => [
                'title' => 'Ay kër dëppoo nañu ak say kiliyaan',
                'body' => ':properties kër yu bees walla yu seen njëg soppiku dëppoo nañu ak :prospects ci say kiliyaan.',
                'sms' => 'Takussan : :properties kër dëppoo nañu ak :prospects ci say kiliyaan.',
            ],
        ],
        'property' => [
            'approved' => [
                'title' => 'Yégle bi nangu nañu ko : :property',
                'body' => 'Sa yégle « :property » nangu nañu ko, ñépp mën nañu koo gis léegi.',
                'sms' => 'Takussan : yégle « :property » nangu nañu ko.',
            ],
            'rejected' => [
                'title' => 'Yégle bi gàntu nañu ko : :property',
                'body' => 'Sa yégle « :property » gàntu nañu ko. Ngirte : :reason. Mën nga koo defar te yónneewaat ko ci sa bérab.',
                'sms' => 'Takussan : yégle « :property » gàntu nañu ko.',
            ],
            'unpublished_contact_erased' => [
                'title' => 'Yéenekaay bi dindi nañu ko : :property',
                'body' => 'Yéenekaay :property (:reference) dindi nañu ko ci site bi : ki ñuy jokkoo ak moom far na kontam. Joxal ko benn ajaŋ te ngay ko siiwal ci kaw : :url',
                'sms' => 'Takussan : yéenekaay :reference dindi nañu ko, amatul ku ñuy jokkoo.',
            ],
        ],
        // TCK-594 (ADR-0039) — les sorties d'argent.
        'payout' => [
            'awaiting_approval' => [
                'title' => 'Reversement :reference ngir nangu',
                'body' => 'Reversement :reference bu :amount mi ngi xaar nga nangu ko.',
                'sms' => 'Takussan : reversement :reference bu :amount ngir nangu.',
            ],
            'due' => [
                'title' => 'Reversement :reference war na',
                'body' => 'Reversement :reference bu :amount jot na : def ko, te bind référence bi.',
                'sms' => 'Takussan : reversement :reference war na.',
            ],
            'processed' => [
                'title' => 'Reversement :reference dem na',
                'body' => 'Reversement bu :amount dañu la ko yónnee. Référence bu transaction bi : :transaction. Destination : :destination.',
                'sms' => 'Takussan : reversement bu :amount dem na.',
            ],
            'failed' => [
                'title' => 'Reversement :reference lajj na',
                'body' => 'Reversement :reference bu :amount demul. Lu ko waral : :reason.',
                'sms' => 'Takussan : reversement :reference lajj na.',
            ],
        ],
        'payout_method' => [
            'added' => [
                'title' => 'Destination de paiement yokk nañu ko',
                'body' => 'Destination de paiement :destination dañu ko yokk ci sa compte. Su dul yaa ko def, jokkool ak sa agence léegi.',
                'sms' => 'Takussan : destination :destination dañu ko yokk ci sa compte.',
            ],
            'updated' => [
                'title' => 'Destination de paiement soppi nañu ko',
                'body' => 'Destination de paiement :destination dañu ko soppi ci sa compte. Su dul yaa ko def, jokkool ak sa agence léegi.',
                'sms' => 'Takussan : destination :destination dañu ko soppi ci sa compte.',
            ],
            'removed' => [
                'title' => 'Destination de paiement far nañu ko',
                'body' => 'Destination de paiement :destination dañu ko far ci sa compte. Su dul yaa ko def, jokkool ak sa agence léegi.',
                'sms' => 'Takussan : destination :destination dañu ko far ci sa compte.',
            ],
        ],
        'payout_threshold' => [
            'relax_requested' => [
                'title' => 'Woyofal seuil bu reversement yi, war nañu ko dëggal',
                'body' => 'Benn ci mbootaayu :agency laaj na ñu woyofal seuil d\'approbation bu reversement yi. Dara du soppiku fii ak benn approbateur bu ñaareel dëggal ko ci réglages bu agence bi.',
                'sms' => 'Takussan : woyofal seuil bu reversement yu :agency, war nañu ko dëggal.',
            ],
        ],
        'owner_statement' => [
            'available' => [
                'title' => 'Sa relevé de gérance :period am na',
                'body' => 'Sa relevé de gérance bu :period mi ngi ci sa espace.',
                'sms' => 'Takussan : sa relevé de gérance :period am na.',
            ],
        ],
        'review' => [
            'to_moderate' => [
                'title' => 'Xalaat bu ñuy saytu : :subject',
                'body' => 'Xalaat bu bees (:rating/5) ci « :subject » mi ngi xaar sa ndigal.',
                'sms' => 'Takussan : xalaat bu ñuy saytu ci « :subject ».',
            ],
            'received' => [
                'title' => 'Xalaat bu bees : :subject',
                'body' => 'Xalaat (:rating/5) ci « :subject » génn na. Mën nga ko tontu ci sa boîte xalaat yi.',
                'sms' => 'Takussan : xalaat bu bees ci « :subject ».',
            ],
        ],
        'moderation' => [
            'property_hidden' => [
                'title' => 'Yégle bi dindi nañu ko : :property',
                'body' => 'Platform bi dindi na sa yégle « :property » ci site bi ndax ab signalement. Ngirte : :reason_code. Platform bi rekk mën koo delloo ci internet.',
                'sms' => 'Takussan : platform bi dindi na yégle « :property ».',
            ],
            'property_removed' => [
                'title' => 'Yégle bi far nañu ko : :property',
                'body' => 'Platform bi far na sa yégle « :property » ndax ab signalement. Ngirte : :reason_code.',
                'sms' => 'Takussan : platform bi far na yégle « :property ».',
            ],
            'report_upheld' => [
                'title' => 'Signalement bi defar nañu ko : :property',
                'body' => 'Jërëjëf : yégle « :property » bi nga signaler, dindi nañu ko ci site bi.',
                'sms' => 'Takussan : sa signalement ci « :property » nangu nañu ko.',
            ],
            'report_dismissed' => [
                'title' => 'Signalement bi saytu nañu ko : :property',
                'body' => 'Saytu nañu sa signalement ci yégle « :property », waaye nanguñu ko.',
                'sms' => 'Takussan : saytu nañu signalement ci « :property ».',
            ],
        ],
    ],

    // TCK-588 — les e-mails de visite partaient en ANGLAIS à un wolophone (fallback_locale = en).

    // TCK-588 — textes des classes Notification qui écrivaient leur prose en dur (français seulement).
    'threshold_alert_mail' => [
        'subject' => '[Takussan] Alerte KPI — :metric',
        'intro' => 'Benn métrique bu ñuy topp weesu na seuil bi.',
        'above' => ':metric : :value ëpp na :threshold (sévérité : :severity).',
        'below' => ':metric : :value wàcc na ci suufu :threshold (sévérité : :severity).',
        'action' => 'Xool tableau de bord bi',
        'cooldown' => 'Alerte bii duñu ko yónneewaat ci biir :hours waxtu.',
    ],
    'urgent_maintenance' => [
        'subject' => 'GAAW : :title',
        'subject_escalation' => 'GAAW LOOL : :title',
        'greeting' => 'Salaam aleekum,',
        'intro' => 'Ñu yónne na laaj defar bu GAAW ngir kër gi.',
        'job' => 'Liggéey : :title',
        'intro_escalation' => 'Laaj defar #:id (:title) dafa GAAW te kenn jàppagul ko ci lu ëpp 30 simili.',
        'cta' => 'Jàppal laaj bii léegi.',
        'title' => 'Gaaw : :title',
        'title_escalation' => 'Gaaw lool : :title',
    ],
    'activity_log_export' => [
        'subject' => 'Sa export journal d\'audit pare na',
        'greeting' => 'Salaam aleekum,',
        'intro' => 'Sa export journal d\'audit (:count rëdd) pare na.',
        'expires' => 'Lien bi ngir yeb dina jeex ci 24 waxtu.',
        'action' => 'Yeb export bi',
        'file' => 'Fichier : :filename',
    ],
    'report_export' => [
        'subject' => 'Sa export rapport pare na',
        'intro' => 'Export rapport « :report » pare na, mën nga koo yeb.',
        'action' => 'Yeb',
        'expires' => 'Lien bii dina jeex ci 7 fan.',
    ],

    // TCK-587 — un bailleur rattaché propose un bien à son agence (brouillon privé à relire).
    'property_proposed' => [
        'title' => 'Kër gu ab boroom kër yónnee : :title',
    ],
];
