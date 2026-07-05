# Atlas — deploy your own instance

Atlas is a personal life OS: unified inbox (Outlook + Gmail), dual calendars,
tasks with due dates, habits, shopping lists, Oura health data, and **an AI
assistant** that lives on the dashboard Whiteboard and in Telegram — it reads
your email in your voice, drafts replies, schedules your to-dos into calendar
gaps, and briefs you every morning.

Each person runs their own private instance. Setup takes ~45 minutes, most of
it clicking through OAuth consoles.

## 1. Fork & deploy

1. Fork this repository.
2. Copy `render.template.yaml` over `render.yaml`, replace every `<PLACEHOLDER>`
   (pick an `<INSTANCE>` suffix like `lacy`), commit, push.
3. In [Render](https://render.com): **New → Blueprint**, point at your fork.
   Render creates the API service and the dashboard site.
4. Fill in the `sync: false` env vars as you complete the sections below.
   Deploys happen automatically on every push and env change.

## 2. Storage — Upstash Redis (free)

1. [upstash.com](https://upstash.com) → Create Database (any region).
2. Copy the **REST URL** and **REST token** into `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`.

## 3. Anthropic API key

[console.anthropic.com](https://console.anthropic.com) → API keys → create →
`ANTHROPIC_API_KEY`. This powers the assistant, briefings, drafting, and email
triage. Model tiers are pre-tuned (Haiku for triage, Sonnet for chat, Fable 5
for email drafting) and overridable via `MODEL_*` env vars.

## 4. Outlook (work email + calendar)

1. [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID → App
   registrations → **New registration**.
   - Supported account types: accounts in this organizational directory
   - Redirect URI (Web): `https://atlas-api-<INSTANCE>.onrender.com/api/outlook/callback`
2. Overview page → copy **Application (client) ID** → `MICROSOFT_CLIENT_ID`,
   and **Directory (tenant) ID** → `MICROSOFT_TENANT_ID`.
3. Certificates & secrets → New client secret → copy the **value** →
   `MICROSOFT_CLIENT_SECRET`.
4. API permissions → add delegated Microsoft Graph permissions:
   `User.Read`, `Mail.Read`, `Mail.Send`, `Calendars.Read`, `offline_access`.
5. After deploy: open the dashboard → **Setup** tab → Connect Outlook.

## 5. Google (personal calendar + Gmail)

1. [console.cloud.google.com](https://console.cloud.google.com) → New project.
2. Enable the **Google Calendar API** and the **Gmail API**
   (APIs & Services → Library).
3. Configure the OAuth consent screen (External, testing mode) and add your
   Gmail address as a **test user**.
4. Credentials → Create OAuth client → Web application → authorized redirect
   URI: `https://atlas-api-<INSTANCE>.onrender.com/api/google/callback`.
5. Copy client ID/secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. After deploy: **Setup** tab → Connect Google. One consent grants calendar
   *and* Gmail.

> Testing-mode refresh tokens expire after 7 days — publish the app in the
> consent screen once you're happy with it to make tokens permanent.

## 6. Telegram bot (your assistant on your phone)

1. In Telegram, message **@BotFather** → `/newbot` → pick a name + username.
2. Copy the token → `TELEGRAM_BOT_TOKEN`.
3. After deploy, message your bot anything — **the first person to message it
   becomes the owner.** Approve family with `/approve <chatId> <name>`
   (partners get a scoped assistant: schedule/tasks/notes, no email access).

## 7. Oura Ring (optional)

[cloud.ouraring.com/personal-access-tokens](https://cloud.ouraring.com/personal-access-tokens)
→ create token → `OURA_TOKEN`. Sleep/readiness/activity sync automatically.

## 8. Lock it down

Generate a long random string (e.g. `openssl rand -hex 32`) and set it as both
`ATLAS_SECRET` (API service) and `VITE_ATLAS_SECRET` (dashboard site). Without
it, anyone with your URLs can read your data.

## 9. Train your assistant

Open the dashboard → **Setup** tab:

- **Learn my style** — analyzes your sent email so drafts sound like you.
- **Upload .md files** — drop in exports from ChatGPT or notes; the assistant
  distills each into memory and can read the full text on demand.

Then just talk to it — Telegram for quick things, the Whiteboard for deep work.

## Personalization reference

| Env var | What it does | Example |
|---|---|---|
| `USER_NAME` | Your full name (drafts sign-off, prompts) | `Lacy Smith` |
| `USER_BIO` | One sentence about you, used in every assistant prompt | `Lacy Smith is a ...` |
| `USER_SIGNOFF` | Email sign-off word | `Best` |
| `USER_TZ` | IANA timezone for calendars/briefings | `America/Denver` |
| `ASSISTANT_NAME` | Rename the assistant | `Juno` |
| `MODEL_CHEAP` / `MODEL_STANDARD` / `MODEL_CRITICAL` | Override the model tiers | `claude-haiku-4-5` |
