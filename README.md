# NetroStatus

Netro Status Page

## Getting started

### Requirements

- [NodeJS](https://nodejs.org)
- [NPM](https://npmjs.com)

### Development

1. Clone repo
2. Run `npm ci`
3. Go to <http://localhost:3000>
4. Make your changes, etc.

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

## License

The content of this repository is licensed under [NC-IPCSAL](https://netrocorp.net/legal/licenses/NC-IPCSAL). Please see [the license file](LICENSE.md) for a copy of this license.
