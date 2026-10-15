# Votifier Tester

Send test votes to Votifier and NuVotifier listeners from a **Votifier** page on each server, so you can check vote rewards without voting on a real site. Built for Pterodactyl 2.0 by The Quantum Development.

- Classic Votifier, NuVotifier v1 (RSA public key), and NuVotifier v2 (token).
- Clear results: delivered, wrong token, wrong key, port closed, not a Votifier port.
- A history of recent tests on the page.
- Uses the Panel's own components and design tokens, so it follows any applied theme.

## Installing

Download [`votifier-tester-2.0.0.pteroext`](https://github.com/LeonardoRRC/votifier-tester/releases/download/v2.0.0/votifier-tester-2.0.0.pteroext) from the [latest release](https://github.com/LeonardoRRC/votifier-tester/releases/latest), then upload it in **Admin → Extensions**, or install it from the Panel root:

```bash
php artisan p:extension:install votifier-tester-2.0.0.pteroext --enable
```

The Votifier client library is bundled. No `composer require` or Panel rebuild is needed.

## Permissions

The page and API require the **ext.votifier-tester.send** subuser permission. Server owners and root administrators always have it.

## Settings

Administrators can change these in **Admin → Extensions → Votifier Tester**:

| Setting | Default | Description |
| --- | --- | --- |
| Only allow the server's own allocations | On | Votes can only be sent to an IP and port assigned to the server. Turn it off to allow any address. |
| Service name | `Votifier Tester` | The vote site name sent with each vote. NuVotifier v2 uses it to choose the token. |
| Timeout (seconds) | `5` | How long to wait for the listener to answer. |
| Votes per minute | `10` | The most test votes a user can send to one server each minute. |

## Development

From a Pterodactyl 2.0 source checkout, with this folder at `extensions/votifier-tester`:

```bash
cd extensions/votifier-tester
composer install --no-dev -o
npm install
npm run typecheck && npm test && npm run build
cd ../..
php artisan p:extension:doctor extensions/votifier-tester
php artisan p:extension:pack extensions/votifier-tester
```
