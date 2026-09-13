const fs = require("fs");
const path = require("path");

require("dotenv").config();

const sites = require("./data/check.production.js");
const templatePath = path.join(__dirname, "index.template.html");
const outputPath = path.join(__dirname, "index.html");
const timeout = Number.parseInt(process.env.REQUEST_TIMEOUT || "5000", 10);

const escapeHTML = (value) =>
	String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const checkSite = async (site) => {
	const checked = new Date();

	try {
		const response = await fetch(site.url, {
			signal: AbortSignal.timeout(timeout),
			redirect: "follow",
		});

		return {
			site,
			checked,
			status: response.status,
			online: response.ok,
			error: response.ok ? null : "Bad response code",
		};
	} catch (error) {
		return {
			site,
			checked,
			status: null,
			online: false,
			error: error.name === "TimeoutError" ? "Request timed out" : error.message,
		};
	}
};

const renderStatusHTML = (results) => {
	if (results.length === 0) {
		return '<div class="status-card offline-card"><details open><summary class="status-header">Well, that\'s a bit odd...</summary><div class="status-content">There are no tracked sites at this time.</div></details></div>';
	}

	return results
		.map(({ site, checked, status, online, error }) => {
			const safeName = escapeHTML(site.name);
			const safeURL = escapeHTML(site.url);
			const safeError = escapeHTML(error);
			const statusText = status === null ? "VERY NOT OK" : `${status} ${error ? "NOT OK" : "OK"}`;

			return `
    <div class="status-card${online ? "" : " offline-card"}">
      <details open>
        <summary class="status-header">
          <p class="site-name"><span>${safeName}</span><span class="status-value url-value">(${safeURL})</span></p>
          <span class="status-indicator ${online ? "online" : "offline"}">${online ? "ONLINE" : "OFFLINE"}</span>
        </summary>
        <div class="status-content">
          <div class="status-info">
            <div class="status-row">
              <span class="status-label">Status:</span>
              <span class="status-value ${online ? "online" : "offline"}">${statusText}</span>
            </div>
            ${error ? `<div class="status-row"><span class="status-label">Error:</span><span class="status-value offline">${safeError}</span></div>` : ""}
            <div class="status-row">
              <span class="status-label">Last Checked:</span>
              <span class="status-value">${checked.toLocaleTimeString()}</span>
            </div>
          </div>
        </div>
      </details>
    </div>`;
		})
		.join("");
};

const build = async () => {
	console.log(`Checking ${sites.length} sites...`);
	const results = await Promise.all(sites.map(checkSite));
	let template = fs.readFileSync(templatePath, "utf8");

	template = template.replace("%statuses%", renderStatusHTML(results));
	template = template.replaceAll("%lastCheck%", new Date().toLocaleString());
	template = template.replaceAll("%title%", "Solync Status");
	template = template.replaceAll(/^[ \t]+$/gm, "");
	fs.writeFileSync(outputPath, template, "utf8");

	for (const { site, online, status } of results) {
		console.log(`${online ? "ONLINE" : "OFFLINE"} ${site.name} (${status ?? "no response"})`);
	}
	console.log(`Wrote ${path.basename(outputPath)}`);
};

build().catch((error) => {
	console.error("Failed to build SolyncStatus:", error);
	process.exitCode = 1;
});
