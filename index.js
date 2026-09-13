/**
 * @typedef {Object} Site
 * @property {string} id - Unique Identifier
 * @property {string} name - Display Name
 * @property {string} url - URL to check
 */

/**
 * @typedef {Object} SiteStatus
 * @property {string} lastOnline - ISO timestamp of the last successful check.
 * @property {number} downtime - Downtime duration in seconds.
 */

/**
 * @typedef {Object} StatusResult
 * @property {string} id - Unique Identifier
 * @property {number|null} status - Status Code
 * @property {number} responseTime - Time to get a response (ms)
 * @property {boolean} online - Whether site is online or not
 * @property {string?} error - Why the site is down
 * @property {number} attempts
 * @property {Date} checked - Date&Time checked
 * @property {string} lastOnline - ISO timestamp of the last successful check.
 * @property {number} downtime - Downtime duration in seconds.
 */

console.log("SolyncStatus is starting...");

const http = require("http");
const https = require("https");
const fs = require("fs");
const url = require("url");
const path = require("path");

console.log("Reading config...");
require("dotenv").config();

const NOTIFICATION_COOLDOWN_MS = 100000;

/** @type {Site[]} */
let sitesToMonitor = null;

try {
	sitesToMonitor = require(`./data/check.${process.env.NODE_ENV == "prod" ? "production" : "development"}.js`);
} catch (err) {
	console.error("Failed to start SolyncStatus. You might be missing a config!", err);
	process.exit(-1);
}

// Store status results
/** @type {{ [id: string]: SiteStatus }} */
let statusHistory = {};
/** @type {{ [id: string]: SiteStatus }} */
const previousStatus = {};
/** @type {{ [id: string]: number }} */
let lastNotificationTime = {};

let lastCheckTime = new Date();

/** @param {"read"|"write"} action */
const readWriteHistory = (action) => {
	if (!["read", "write"].includes(action)) return; // Invalid
	const readable = { read: "loading", write: "writing" };

	const file = "./data/history.json";

	try {
		if (action == "write" || !fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(statusHistory), "utf8");

		if (action == "read") statusHistory = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (err) {
		console.error(`Error ${readable[action]} status history:`, err);
	}
};
readWriteHistory("read");

// Send a Discord embed notification on status change
/**
 *
 * @param {Site} site
 * @param {StatusResult} result
 */
const sendDiscordNotification = (site, result) => {
	const shEntry = statusHistory[site.id];

	const embed = {
		title: `${site.name} is offline`,
		color: 0xff0000,
		fields: [
			{ name: "URL", value: site.url, inline: false },
			{ name: "Error", value: result.error || "No response", inline: false },
			{ name: "Checked at", value: result.checked.toISOString(), inline: false },
		],
		footer: { text: "SolyncStatus Monitoring" },
		timestamp: new Date().toISOString(),
	};

	if (result.online && previousStatus[site.id] === false) {
		embed.title = `${site.name} is online`;
		embed.color = 0x00ff00;
		embed.fields = [
			{ name: "URL", value: site.url, inline: false },
			{ name: "Status Code", value: `${result.status}`, inline: false },
			{
				name: "Downtime Duration",
				value: shEntry?.downtime != null ? `${shEntry.downtime} seconds` : "N/A",
				inline: false,
			},
			{ name: "Checked at", value: result.checked.toISOString(), inline: false },
		];
	}

	// Sending
	const placesToGo = [
		{
			name: "Members",
			url: process.env.DISCORDWEBHOOK_MEMBERS_URL || null,
			message: process.env.DISCORDWEBHOOK_MEMBERS_MESSAGE || null,
		},
		{
			name: "Community",
			url: process.env.DISCORDWEBHOOK_MAIN_URL || null,
			message: process.env.DISCORDWEBHOOK_MAIN_MESSAGE || null,
		},
	].filter((v) => v.url != null && v.url != "");
	placesToGo.forEach((place, index) => {
		const webhookUrl = new URL(place.url);

		const payload = JSON.stringify({ content: place.message, embeds: [embed] });
		const req = https.request(
			{
				hostname: webhookUrl.hostname,
				path: webhookUrl.pathname + webhookUrl.search,
				port: 443,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(payload),
				},
			},
			(res) => {
				if (res.statusCode === 204) {
					console.log(
						`[discord-webhook | ${place.name}] : send ${site.name} ${result.online ? "online" : "offline"} notice success`,
					);
				} else {
					console.error(
						`[discord-webhook | ${place.name}] : got ${res.statusCode} sending ${site.name} ${result.online ? "online" : "offline"} notice hook`,
					);
				}
			},
		);

		req.on("error", (err) => {
			console.error(
				`[discord-webhook | ${place.name}] : got error sending ${site.name} ${result.online ? "online" : "offline"} notice hook`,
				err,
			);
		});
		req.write(payload);
		req.end();
	});
};

// Function to check site status with retry logic
/** @param {Site} site */
const checkSiteStatus = async (site) => {
	return new Promise(async (resolve) => {
		const parsedUrl = new URL(site.url);
		const protocol = parsedUrl.protocol === "https:" ? https : http;

		// Retry logic
		let attempts = 0;
		const maxAttempts = 3;

		/** @type {StatusResult} */
		let result;

		while (attempts < maxAttempts) {
			attempts++;

			const startTime = Date.now();

			result = await new Promise((resolveAttempt) => {
				const req = protocol.request(
					{
						hostname: parsedUrl.hostname,
						path: parsedUrl.pathname || "/",
						port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
						method: "GET",
						timeout: parseInt(process.env.REQUEST_TIMEOUT || "5000"),
					},
					(res) => {
						const endTime = Date.now();
						const responseTime = endTime - startTime;

						if (res.statusCode >= 200 && res.statusCode < 400) {
							resolveAttempt({
								id: site.id,
								status: res.statusCode,
								responseTime: responseTime,
								online: true,
								checked: new Date(),
							});
						} else {
							resolveAttempt({
								id: site.id,
								status: res.statusCode,
								responseTime: responseTime,
								error: "Bad response code",
								online: false,
								checked: new Date(),
							});
						}
					},
				);

				req.on("error", (error) => {
					resolveAttempt({
						id: site.id,
						status: null,
						responseTime: 0,
						online: false,
						error: error.message,
						checked: new Date(),
					});
				});

				req.on("timeout", () => {
					req.destroy();
					resolveAttempt({
						id: site.id,
						status: null,
						responseTime: 0,
						online: false,
						error: "Request timed out",
						checked: new Date(),
					});
				});

				req.end();
			});

			// If status is 200 or we've hit max attempts, stop retrying
			if (result.status === 200 || attempts >= maxAttempts) {
				break;
			}

			// Wait 1 second before retry
			await new Promise((r) => setTimeout(r, 1000));
		}

		// Add attempt information
		result.attempts = attempts;

		// Update status history
		if (!statusHistory[site.id]) {
			statusHistory[site.id] = {
				lastOnline: result.online ? new Date().toISOString() : null,
				downtime: 0,
			};
		} else {
			// Update last online time if site is online
			if (result.online) {
				statusHistory[site.id].lastOnline = new Date().toISOString();
			}
			// Calculate downtime if the site was previously online but is now offline
			else if (statusHistory[site.id].lastOnline) {
				const lastOnlineDate = new Date(statusHistory[site.id].lastOnline);
				statusHistory[site.id].downtime = Math.floor((new Date() - lastOnlineDate) / 1000);
			}
		}

		// Add last online time to result if site is offline
		if (!result.online && statusHistory[site.id] && statusHistory[site.id].lastOnline) {
			result.lastOnline = statusHistory[site.id].lastOnline;
			result.downtime = statusHistory[site.id].downtime;
		}

		readWriteHistory("write");

		// discord shit
		if (previousStatus[site.id] === undefined) {
			previousStatus[site.id] = result.online;
		} else if (previousStatus[site.id] !== result.online) {
			const now = Date.now();
			const lastNotif = lastNotificationTime[site.id] || 0;
			if (now - lastNotif >= NOTIFICATION_COOLDOWN_MS) {
				sendDiscordNotification(site, result);
				lastNotificationTime[site.id] = now;
				previousStatus[site.id] = result.online;
			} else {
				console.log(
					`skipping notification for ${site.id} (change: ${previousStatus[site.id]} -> ${result.online})`,
				);
			}
		}

		resolve(result);
	});
};

// Function to check all sites
/** @type {StatusResult[]} */
let statusResults = undefined;
const checkAllSites = async () => {
	const promises = sitesToMonitor.map((site) => checkSiteStatus(site));
	statusResults = await Promise.all(promises);
	lastCheckTime = new Date();
};

// Initial check
checkAllSites();

// Schedule checks every 45 seconds (or as configured in .env)
const checkInterval = parseInt(process.env.CHECK_INTERVAL || "45000");
setInterval(checkAllSites, checkInterval);

// Generate status HTML based on results
const generateStatusHTML = () => {
	if (statusResults.length < 1)
		return '<div class="status-card offline-card"><details open><summary class="status-header">Well, that\'s a bit odd...</summary><div class="status-content">There here are no tracked sites at this time.</div></details></div>';
	return statusResults
		.map((result) => {
			const site = sitesToMonitor.find((v) => v.id === result.id);
			if (!site) return; // How is there a site here and not in our cache?

			// Format downtime if available
			let downtimeStr = "";
			if (result.downtime) {
				const days = Math.floor(result.downtime / 86400);
				const hours = Math.floor((result.downtime % 86400) / 3600);
				const minutes = Math.floor((result.downtime % 3600) / 60);
				const seconds = Math.floor(result.downtime % 60);

				if (days > 0) {
					downtimeStr = `${days}d ${hours}h ${minutes}m`;
				} else if (hours > 0) {
					downtimeStr = `${hours}h ${minutes}m ${seconds}s`;
				} else if (minutes > 0) {
					downtimeStr = `${minutes}m ${seconds}s`;
				} else {
					downtimeStr = `${seconds}s`;
				}
			}

			return `
    <div class="status-card${result.online ? "" : " offline-card"}">
      <details open>
        <summary class="status-header">
          <p class="site-name"><span>${site.name}</span><span class="status-value url-value">(${site.url})</span></p>
          <span class="status-indicator ${result.online ? "online" : "offline"}">
            ${result.online ? "ONLINE" : "OFFLINE"}
          </span>
        </summary>
        <div class="status-content">
          <div class="status-info">
            <div class="status-row">
              <span class="status-label">Status:</span>
              <span class="status-value ${result.online ? "online" : "offline"}">
                ${result.status} ${result.status ? (result.error == null ? "OK" : "NOT OK") : "VERY NOT OK"}
              </span>
            </div>
			<!-- Hide this from regular users, but still send it so we can debug stuffs if needed
            <div class="status-row">
              <span class="status-label">Latency:</span>
              <span class="status-value">
                ${result.responseTime ? result.responseTime + "ms" : "N/A"}
              </span>
            </div>
			-->
            ${
				result.attempts > 1
					? `
	        <!-- Hide this from regular users, but still send it so we can debug stuffs if needed
            <div class="status-row">
              <span class="status-label">Attempts:</span>
              <span class="status-value">${result.attempts} of 3</span>
            </div>
			-->
            `
					: ""
			}
            ${
				result.error
					? `
	        <!-- Hide this from regular users, but still send it so we can debug stuffs if needed
            <div class="status-row">
              <span class="status-label">Error:</span>
              <span class="status-value offline">${result.error}</span>
            </div>
			-->
            `
					: ""
			}
            ${
				!result.online && result.lastOnline
					? `
            <div class="status-row">
              <span class="status-label">Last Seen Online:</span>
              <span class="status-value">${new Date(result.lastOnline).toLocaleString()}</span>
            </div>
            <div class="status-row">
              <span class="status-label">Downtime:</span>
              <span class="status-value offline">${downtimeStr}</span>
            </div>
            `
					: ""
			}
            <div class="status-row">
              <span class="status-label">Last Checked:</span>
              <span class="status-value">${result.checked.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </details>
    </div>
  `;
		})
		.join("");
};

// Create HTTP server
const server = http.createServer((req, res) => {
	const parsedUrl = url.parse(req.url, true);
	const pathname = parsedUrl.pathname;

	const mime = {
		".png": "image/png",
		".ico": "image/x-icon",
		".svg": "image/svg+xml",
		".woff2": "font/woff2",
		".html": "text/html",
		".txt": "text/plain",
	};

	// Serve favicon & logo
	if (pathname === "/favicon.svg" || pathname == "/logo.png") {
		try {
			const file = path.join(process.cwd(), pathname);
			const img = fs.readFileSync(file);
			res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "image/svg+xml" });
			res.end(img);
			return;
		} catch (err) {
			res.writeHead(404);
			res.end();
			return;
		}
	}

	// Serve local fonts
	if (pathname === "/fonts/CabinetGrotesk/CabinetGrotesk-Variable.woff2") {
		try {
			const file = path.join(process.cwd(), pathname);
			const font = fs.readFileSync(file);
			res.writeHead(200, { "Content-Type": mime[".woff2"] });
			res.end(font);
			return;
		} catch (err) {
			res.writeHead(404);
			res.end();
			return;
		}
	}

	// Handle root path request
	if (pathname === "/") {
		try {
			if (typeof statusResults === "undefined") throw new Error("init");

			// Read HTML template
			let template = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");

			// Replace placeholders
			template = template.replace("%statuses%", generateStatusHTML());
			template = template.replace(/%lastCheck%/g, lastCheckTime.toLocaleString());
			template = template.replace(/%title%/g, "Solync Status");

			res.writeHead(200, { "Content-Type": mime[".html"] });
			res.end(template);
		} catch (err) {
			if (err.message == "init")
				return res
					.writeHead(500, { "Content-Type": mime[".txt"] })
					.end("SolyncStatus is still initializing. Please refresh in a few moments.");

			console.error("Error serving template:", err);
			res.writeHead(500, { "Content-Type": mime[".txt"] });
			res.end("Internal Server Error");
		}
	} else {
		res.writeHead(404);
		res.end(); // allow Solync to handle the 404 page
		return;
	}
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`SolyncStatus now running on http://localhost:${PORT}`);
});
