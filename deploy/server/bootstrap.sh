#!/usr/bin/env bash
# Prépare un Ubuntu 24.04 VIERGE à recevoir Dokploy (ADR-0028, plan tâche A2).
#
# Idempotent : rejouable sans effet de bord. À lancer en root, une seule fois par machine.
#   ADMIN_IP=<ip publique du poste> bash bootstrap.sh
#
# ADMIN_IP garde l'interface de Dokploy (port 3000) joignable depuis le poste le temps de lui
# donner son domaine (A3). Rejouer ensuite SANS ADMIN_IP ferme le port à tous.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "✗ à lancer en root" >&2; exit 1; }
grep -q 'VERSION_ID="24.04"' /etc/os-release || { echo "✗ Ubuntu 24.04 attendu" >&2; exit 1; }

# ── 1. Swap de 4 Go ──────────────────────────────────────────────────────────────────────
# 8 Go pour quatre environnements : sans swap, le premier pic (un `scout:import`, un seed)
# réveille l'OOM killer, qui choisit sa victime — souvent la base.
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -q --system

# ── 2. Mises à jour de sécurité automatiques ──────────────────────────────────────────────
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -y -q upgrade
apt-get -y -q install ufw unattended-upgrades fail2ban curl ca-certificates jq
dpkg-reconfigure -f noninteractive unattended-upgrades

# ── 3. SSH par clé seulement ──────────────────────────────────────────────────────────────
[ -s /root/.ssh/authorized_keys ] || { echo "✗ aucune clé dans /root/.ssh/authorized_keys : on se fermerait dehors" >&2; exit 1; }
cat > /etc/ssh/sshd_config.d/10-durcissement.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh

# ── 4. Pare-feu ───────────────────────────────────────────────────────────────────────────
# ⚠ ufw NE PROTÈGE PAS les ports publiés par Docker : Docker écrit ses règles dans la chaîne
# FORWARD, avant ufw. C'est l'objet du point 6. Et ne JAMAIS installer iptables-persistent :
# il désinstalle ufw.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── 5. Docker, journaux bornés AVANT le premier conteneur ─────────────────────────────────
# Sans rotation, un worker bavard remplit le disque, et un disque plein met PostgreSQL en
# lecture seule pour les quatre environnements à la fois.
install -d /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# ── 6. Fermer le port 3000 (interface de Dokploy) sur l'interface publique ────────────────
# Dokploy publie son interface sur 3000, par Docker, donc hors de portée d'ufw. La règle vit
# dans DOCKER-USER, que Docker évalue avant ses propres règles et ne vide jamais. Elle
# compare le port d'ORIGINE (conntrack), puisque le paquet a déjà été redirigé.
cat > /usr/local/sbin/fermer-port-3000 <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[ -f /etc/default/fermer-port-3000 ] && . /etc/default/fermer-port-3000
iface=$(ip route show default | awk '{print $5; exit}')
for outil in iptables ip6tables; do
  for _ in $(seq 30); do "$outil" -L DOCKER-USER -n >/dev/null 2>&1 && break; sleep 1; done
  "$outil" -L DOCKER-USER -n >/dev/null 2>&1 || continue
  regle=(-i "$iface" -p tcp -m conntrack --ctorigdstport 3000 --ctdir ORIGINAL)
  "$outil" -C DOCKER-USER "${regle[@]}" -j DROP 2>/dev/null || "$outil" -I DOCKER-USER "${regle[@]}" -j DROP
  # l'exception de l'administrateur, insérée APRÈS, passe donc AVANT le DROP
  if [ "$outil" = iptables ] && [ -n "${ADMIN_IP:-}" ]; then
    "$outil" -C DOCKER-USER -s "$ADMIN_IP" "${regle[@]}" -j RETURN 2>/dev/null \
      || "$outil" -I DOCKER-USER -s "$ADMIN_IP" "${regle[@]}" -j RETURN
  fi
done
EOF
chmod 755 /usr/local/sbin/fermer-port-3000
if [ -n "${ADMIN_IP:-}" ]; then
  echo "ADMIN_IP=${ADMIN_IP}" > /etc/default/fermer-port-3000
else
  rm -f /etc/default/fermer-port-3000
  # retirer une exception posée par un passage précédent
  while regle=$(iptables -S DOCKER-USER 2>/dev/null | grep -m1 -- '--ctorigdstport 3000.*-j RETURN'); do
    read -ra args <<< "${regle#-A DOCKER-USER }"
    iptables -D DOCKER-USER "${args[@]}"
  done
fi
cat > /etc/systemd/system/fermer-port-3000.service <<'EOF'
[Unit]
Description=Ferme le port 3000 (interface Dokploy) sur l'interface publique
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/sbin/fermer-port-3000

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable fermer-port-3000
systemctl restart fermer-port-3000

echo "✓ serveur préparé. Mesurer maintenant depuis le POSTE (plan, tâche A2, étape 4)."
