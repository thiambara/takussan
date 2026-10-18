# La base de données du serveur, avec WAL-G (ADR-0069 § 5, TCK-930).
#
# Ce n'est PAS une autre base : c'est l'image que Dokploy servait déjà, épinglée à l'empreinte
# relevée sur le serveur le 2026-10-18 (`docker image inspect pgvector/pgvector:pg17` →
# PostgreSQL 17.11, Debian 12, glibc 2.36), à laquelle s'ajoutent le binaire de WAL-G et trois
# réglages d'archivage. Le volume de données ne change pas ; changer d'image, c'est redémarrer.
#
# Construite et poussée par `.github/workflows/image-postgres.yml`, après l'épreuve
# `deploy/postgres/epreuve.sh` (archivage, sauvegarde de base, restauration à un instant choisi).
# Le serveur ne construit rien (ADR-0028 § 2).
#
# ⚠ Monter PostgreSQL ou pgvector, c'est changer l'empreinte ci-dessous : un geste à part, relevé,
# jamais l'effet d'un `pg17` qui se déplace sur le registre.
FROM pgvector/pgvector:pg17@sha256:ac08538c6f8b9904c33c8224c5e5706dbe760aca29db1d096972b4052c22a75d

# WAL-G 3.0.9 (2026-08-20), version « pg » construite pour Ubuntu 22.04 (glibc 2.35, que la
# glibc 2.36 de Debian 12 sert). La somme est celle publiée avec la version, revérifiée au
# téléchargement le 2026-10-18.
ARG WALG_VERSION=v3.0.9
ARG WALG_SHA256=d6795c663894d836ba20840bffe8970aed81bbe25d3151bd4951f6f9c362def9
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Les autorités de certification : l'image de base n'en porte AUCUNE (`/etc/ssl/certs` vide), et
# WAL-G ne joint R2 qu'en TLS. Sans elles, chaque envoi échoue sur
# `x509: certificate signed by unknown authority`, que WAL-G retente en silence sans fin — c'est ce
# qui a bloqué l'archivage à la première bascule, le 2026-10-18. L'épreuve le garde désormais.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates=20250419~deb12u1 \
 && rm -rf /var/lib/apt/lists/*

ADD https://github.com/wal-g/wal-g/releases/download/${WALG_VERSION}/wal-g-pg-22.04-amd64 /usr/local/bin/wal-g
RUN echo "${WALG_SHA256}  /usr/local/bin/wal-g" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/wal-g \
 && /usr/local/bin/wal-g --version

# L'archivage continu. La configuration de WAL-G (seau, jeton, point d'accès R2) vient de
# l'environnement du service Database de Dokploy : aucune image ne porte de secret.
#   archive_timeout = 300 : un segment est fermé au plus 5 minutes après une écriture — au plus
#   5 minutes perdues (ADR-0069 § 5). Une base inactive ne produit aucun segment.
#   Sans configuration, `wal-push` échoue : PostgreSQL GARDE alors ses segments et réessaie. C'est
#   voulu (rien n'est perdu), et `deploy/server/wal-g.sh veille` le signale.
CMD ["postgres", "-c", "archive_mode=on", "-c", "archive_command=/usr/local/bin/wal-g wal-push %p", "-c", "archive_timeout=300"]
