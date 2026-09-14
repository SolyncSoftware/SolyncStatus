# SolyncStatus

Solync Status Page

## Getting started

### Requirements

- [NodeJS](https://nodejs.org)
- [Bun](https://bun.com/)

### Development

1. Clone repo
2. Run `bun i`
3. Run `bun run start`
4. Go to <http://localhost:3000>
5. Make your changes, etc.

### GitHub Pages

Run `bun run build` to check the production sites and generate the static root `index.html`. The included GitHub Actions workflow runs this build and deploys the result to GitHub Pages whenever `main` is updated and every five minutes thereafter.

### Configuration for Development

For development, you can set up a simple testing grounds, like so:

`data/check.development.js`:

```js
module.exports = [
 {
  id: "test",
  name: "Test Site",
  url: "https://test.example.com",
 },
];
```

`.env`

```env
# App Settings
PORT=3000
CHECK_INTERVAL="5000"
REQUEST_TIMEOUT="5000"

# Webhook(s) to send the Status updates to when something is down or up etc.
DISCORDWEBHOOK_MEMBERS_MESSAGE="whateveryouwantHERE"
DISCORDWEBHOOK_MEMBERS_URL="webhookURLhere"
DISCORDWEBHOOK_MAIN_URL=""
DISCORDWEBHOOK_MAIN_MESSAGE=""
```

Notes:

- These won't be published to GitHub.
- It is recommended to leave the `DISCORDWEBHOOK_MAIN_*` alone when testing.
- Check Interval is 5000ms (5s) so offline/online updates faster.
