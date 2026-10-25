#!/usr/bin/env python3
"""Relève dans Dokploy la valeur de clés d'environnement NON secrètes d'un Compose (P14.08, 2026-10-25).

`docs/infra/prod-drivers.json` enregistre ce que Dokploy déclare. Ce relevé se faisait par un
`source` du fichier de secrets puis un `curl` : la clé d'API passait par l'expansion du shell, la
voie par laquelle des fragments de mot de passe ont déjà fui (2026-09-14). Ce script lit la clé
d'API dans le fichier de secrets sans l'imprimer, et ne rend que les clés demandées.

Une clé dont le nom désigne un secret est refusée avant tout appel : le script ne sait pas
imprimer une valeur secrète, même par erreur.

Usage :
  python3 -I deploy/takussan/relever-cles-dokploy.py <composeId> LOG_CHANNEL LOG_LEVEL

  composeId de la préproduction : JbPrtvdkuq0aLTDrOx2Ss (docs/infra/prod-drivers.json, `_mesure`).
"""
import json
import os
import re
import sys
import urllib.request

SECRETS = os.path.expanduser('~/Sauvegardes/migration-secrets.env')
INTERDITES = re.compile(r'(KEY|SECRET|PASSWORD|TOKEN|PASS|DSN|CREDENTIAL|PRIVATE|SALT)', re.I)


def cle_d_api() -> str:
    for ligne in open(SECRETS, encoding='utf-8'):
        if ligne.startswith('DOKPLOY_API_KEY='):
            return ligne.split('=', 1)[1].strip().strip('"').strip("'")
    sys.exit('DOKPLOY_API_KEY absente du fichier de secrets')


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    compose, cles = sys.argv[1], sys.argv[2:]
    refusees = [c for c in cles if INTERDITES.search(c)]
    if refusees:
        sys.exit(f'refusé, nom de secret : {", ".join(refusees)}')

    requete = urllib.request.Request(
        f'https://deploy.takussan.com/api/compose.one?composeId={compose}',
        # L'API de Dokploy refuse l'agent par défaut d'urllib : elle exige un agent curl.
        headers={'x-api-key': cle_d_api(), 'user-agent': 'curl/8.7.1'},
    )
    with urllib.request.urlopen(requete, timeout=30) as reponse:
        env = json.load(reponse).get('env') or ''
        print(f'http {reponse.status}, {len(env.splitlines())} lignes d\'environnement')

    valeurs = {}
    for ligne in env.splitlines():
        nom, _, valeur = ligne.partition('=')
        valeurs[nom.strip()] = valeur.strip()
    for cle in cles:
        print(f'{cle} = {valeurs.get(cle, "(absente)")}')


if __name__ == '__main__':
    main()
