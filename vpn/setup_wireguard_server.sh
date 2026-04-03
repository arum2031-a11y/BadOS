#!/usr/bin/env bash
set -euo pipefail

# Real WireGuard VPN server bootstrap for Ubuntu/Debian.
# Run as root: sudo bash setup_wireguard_server.sh

WG_IFACE="wg0"
WG_DIR="/etc/wireguard"
WG_PORT="51820"
WG_NET="10.8.0.0/24"
SERVER_IP="10.8.0.1/24"
SERVER_PUB_NIC="$(ip route get 1.1.1.1 | awk '/dev/ {print $5; exit}')"

if [[ -z "${SERVER_PUB_NIC}" ]]; then
  echo "Could not detect public network interface." >&2
  exit 1
fi

echo "[1/6] Installing WireGuard + QR tools..."
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard qrencode

echo "[2/6] Generating server key pair..."
umask 077
mkdir -p "${WG_DIR}"
SERVER_PRIV="${WG_DIR}/server_private.key"
SERVER_PUB="${WG_DIR}/server_public.key"
[[ -f "${SERVER_PRIV}" ]] || wg genkey | tee "${SERVER_PRIV}" | wg pubkey > "${SERVER_PUB}"

echo "[3/6] Writing ${WG_DIR}/${WG_IFACE}.conf ..."
cat > "${WG_DIR}/${WG_IFACE}.conf" <<CFG
[Interface]
Address = ${SERVER_IP}
ListenPort = ${WG_PORT}
PrivateKey = $(cat "${SERVER_PRIV}")
SaveConfig = true

# NAT + forwarding for VPN clients
PostUp = sysctl -w net.ipv4.ip_forward=1
PostUp = iptables -A FORWARD -i ${WG_IFACE} -j ACCEPT
PostUp = iptables -A FORWARD -o ${WG_IFACE} -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -s ${WG_NET} -o ${SERVER_PUB_NIC} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_IFACE} -j ACCEPT
PostDown = iptables -D FORWARD -o ${WG_IFACE} -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s ${WG_NET} -o ${SERVER_PUB_NIC} -j MASQUERADE
CFG

chmod 600 "${WG_DIR}/${WG_IFACE}.conf"

echo "[4/6] Enabling persistent IPv4 forwarding..."
cat > /etc/sysctl.d/99-wireguard-forward.conf <<EOF2
net.ipv4.ip_forward = 1
EOF2
sysctl --system >/dev/null

echo "[5/6] Starting WireGuard service..."
systemctl enable "wg-quick@${WG_IFACE}" --now

echo "[6/6] Creating first client profile template..."
CLIENT_NAME="home-macbook"
CLIENT_PRIV="${WG_DIR}/${CLIENT_NAME}_private.key"
CLIENT_PUB="${WG_DIR}/${CLIENT_NAME}_public.key"
CLIENT_IP="10.8.0.2/32"

[[ -f "${CLIENT_PRIV}" ]] || wg genkey | tee "${CLIENT_PRIV}" | wg pubkey > "${CLIENT_PUB}"

SERVER_PUBLIC_KEY="$(cat "${SERVER_PUB}")"
CLIENT_PUBLIC_KEY="$(cat "${CLIENT_PUB}")"
SERVER_PUBLIC_ENDPOINT="CHANGE_ME_PUBLIC_IP_OR_DNS:${WG_PORT}"

wg set "${WG_IFACE}" peer "${CLIENT_PUBLIC_KEY}" allowed-ips "${CLIENT_IP}"

cat > "${WG_DIR}/${CLIENT_NAME}.conf" <<EOF3
[Interface]
PrivateKey = $(cat "${CLIENT_PRIV}")
Address = 10.8.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = ${SERVER_PUBLIC_KEY}
Endpoint = ${SERVER_PUBLIC_ENDPOINT}
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF3

chmod 600 "${WG_DIR}/${CLIENT_NAME}.conf"

echo
echo "WireGuard server is running on ${WG_IFACE}."
echo "Client config created: ${WG_DIR}/${CLIENT_NAME}.conf"
echo "IMPORTANT: Edit Endpoint in client config to your real public IP/DNS + port ${WG_PORT}."
echo "Then import the client config into WireGuard on your MacBook."
echo
echo "Server public key: ${SERVER_PUBLIC_KEY}"
echo "Client QR (for mobile import):"
qrencode -t ANSIUTF8 < "${WG_DIR}/${CLIENT_NAME}.conf"
