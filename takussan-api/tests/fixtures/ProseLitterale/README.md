Fixtures de `tests/Unit/Architecture/ProseLitteraleInterditeTest.php` (TCK-588, ADR-0032).

Jamais exécutées ni chargées : le scanner les lit comme du texte. Chaque positif porte en
commentaire la forme qu'il illustre ; le test compte les positifs EXACTEMENT, par fichier et par
forme — un scanner qui en trouve un de moins ou un de plus est faux.

`Notifications/` reproduit le chemin `app/Notifications/` : les formes (c) et (g) n'y valent que là.
