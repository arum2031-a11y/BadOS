# Real VPN Setup (WireGuard)

This is a **real VPN** setup using WireGuard.

## What this gives you
- A real WireGuard VPN server (on a Linux VPS/home server).
- A real client profile for your **home MacBook**.
- Full-tunnel routing (`AllowedIPs = 0.0.0.0/0`).

## 1) Server requirements
- Ubuntu/Debian server with public IP.
- UDP port **51820** open in firewall/router.
- Root access.

## 2) Run the setup script on the server
```bash
sudo bash vpn/setup_wireguard_server.sh
```

The script will:
- Install WireGuard.
- Generate server and client keys.
- Enable IP forwarding.
- Configure NAT.
- Start `wg-quick@wg0`.
- Output a client config at `/etc/wireguard/home-macbook.conf`.

## 3) Update endpoint
Edit the client file and replace:
- `Endpoint = CHANGE_ME_PUBLIC_IP_OR_DNS:51820`

with your real public IP or DNS.

## 4) Connect your MacBook
1. Install the official WireGuard app on macOS.
2. Import `/etc/wireguard/home-macbook.conf`.
3. Toggle **Activate**.

## 5) Verify
On MacBook:
```bash
curl ifconfig.me
```
You should see your VPN server public IP.

## Security notes
- Keep private keys private.
- Use a dedicated server with OS updates enabled.
- Consider restricting SSH and enabling MFA for admin access.
