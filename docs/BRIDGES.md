# Bridges

Official images from [docs.mau.fi](https://docs.mau.fi/bridges/general/docker-setup.html). Provisioning uses the bridgev2 **v3** API (`/_matrix/provision/v3/login/flows` and `/v3/login/start/{flowID}`).

| Network | Image | Profile | Notes |
| --- | --- | --- | --- |
| Telegram | `dock.mau.dev/mautrix/telegram:v26.08` | `telegram` | Needs `TELEGRAM_API_ID` / `HASH` |
| WhatsApp | `dock.mau.dev/mautrix/whatsapp:v26.08` | `whatsapp` | QR via provisioning |
| Signal | `dock.mau.dev/mautrix/signal:v26.08` | `signal` | QR / link device |
| Instagram | `dock.mau.dev/mautrix/meta:ig-v26.08` | `instagram` | Experimental; dedicated Instagram image tags |
| Messenger | `dock.mau.dev/mautrix/meta:v26.08.1` | `messenger` | Experimental |
| Discord | `dock.mau.dev/mautrix/discord:v26.08` | `discord` | Experimental |
| MockChat | in-process adapter | n/a | Development only |

Users connect from **Settings → Connections**. Bridge management rooms and `!login` commands are not shown.

Provisioning listeners stay on the Docker internal network.
