(function () {
	var script = document.currentScript;
	var apiBase = script.getAttribute("data-api");
	var clientId = script.getAttribute("data-client");
	var mountId = script.getAttribute("data-mount") || "gigsync-calendar";

	function el(tag, className, text) {
		var e = document.createElement(tag);
		if (className) e.className = className;
		if (text) e.textContent = text;
		return e;
	}

	function getMount() {
		return document.getElementById(mountId);
	}

	function renderEmpty(message) {
		var mount = getMount();
		if (!mount) return;
		mount.innerHTML = "";
		mount.className = "gigsync-widget";
		mount.appendChild(el("p", "gigsync-empty", message));
	}

	function renderGigs(gigs) {
		var mount = getMount();
		if (!mount) return;
		mount.innerHTML = "";
		mount.className = "gigsync-widget";

		if (!gigs.length) {
			renderEmpty("No upcoming shows yet — check back soon.");
			return;
		}

		var list = el("ul", "gigsync-list");
		gigs
			.slice()
			.sort(function (a, b) {
				return (a.date || "").localeCompare(b.date || "");
			})
			.forEach(function (gig) {
				var item = el("li", "gigsync-item");
				item.appendChild(el("div", "gigsync-date", gig.date || "Date TBA"));

				var details = el("div", "gigsync-details");
				details.appendChild(el("div", "gigsync-venue", gig.venue || "Venue TBA"));
				var meta = [gig.time, gig.address].filter(Boolean).join(" — ");
				if (meta) details.appendChild(el("div", "gigsync-meta", meta));
				item.appendChild(details);

				list.appendChild(item);
			});
		mount.appendChild(list);
	}

	if (!apiBase || !clientId) {
		console.error("gigsync widget: script tag needs data-api and data-client attributes");
		return;
	}

	fetch(apiBase.replace(/\/$/, "") + "/gigs?client=" + encodeURIComponent(clientId))
		.then(function (res) {
			if (!res.ok) throw new Error("gigsync: bad response " + res.status);
			return res.json();
		})
		.then(function (data) {
			renderGigs(data.gigs || []);
		})
		.catch(function (err) {
			console.error("gigsync widget:", err);
			renderEmpty("Unable to load upcoming shows right now.");
		});
})();
