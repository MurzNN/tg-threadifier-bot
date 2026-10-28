# tg-threadifier-bot Helm chart

Deploys Threadifier using the [bjw-s common / app-template](https://bjw-s-labs.github.io/helm-charts/docs/app-template/) library (`common` 5.3.0).

## Prerequisites

- Kubernetes ≥ 1.28
- Helm 3.14+
- A BotFather token (Test DC token is fine for manual testing)

## Install

```bash
helm dependency update ./charts/tg-threadifier-bot

# Replace BOT_TOKEN and align DATABASE_URL host with "{release}-postgres"
helm upgrade --install threadifier ./charts/tg-threadifier-bot \
  --namespace threadifier --create-namespace \
  --set secrets.credentials.stringData.BOT_TOKEN='123456:ABC' \
  --set secrets.credentials.stringData.DATABASE_URL='postgresql://threadifier:changeme@threadifier-postgres:5432/threadifier'
```

Built-in Postgres (`controllers.postgres`) defaults to password `changeme` — change both `POSTGRES_PASSWORD` and `DATABASE_URL` together for anything beyond a throwaway cluster.

## External Postgres

```bash
helm upgrade --install threadifier ./charts/tg-threadifier-bot \
  -f ./charts/tg-threadifier-bot/values.yaml \
  -f ./charts/tg-threadifier-bot/values-external-db.yaml \
  --set secrets.credentials.stringData.BOT_TOKEN='…' \
  --set secrets.credentials.stringData.DATABASE_URL='postgresql://user:pass@host:5432/threadifier'
```

## Ingress / Mini App URL

Enable `ingress.app` and set container env `WEBAPP_URL` to the public origin (used once the Mini App lands in M4).

## Values

See `values.yaml`. Autocomplete schema:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/bjw-s-labs/helm-charts/main/charts/library/common/values.schema.json
```
