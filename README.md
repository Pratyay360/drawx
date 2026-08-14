# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.


# download binaries
[Download](https://web.crabnebula.cloud/pratyay/drawx/releases)



[debian](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/debian-x86_64)
[rpm](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/rpm-x86_64)
[arch](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/arch-x86_64)
[macos](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/macos-x86_64)
[windows](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/nsis-x86_64)
[windows](https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/windows-x86_64)

<div>
	<head>
	<script src="https://cdn.tailwindcss.com"></script>
</head>

<body class="p-4">
	<a
		data-crabnebula
		class="rounded bg-indigo-600 px-2 py-1 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
		rel="noopener"
		type="button"
		>Download for -
	</a>
	<div>
		<a
			data-crabnebula
			class="text-xs font-medium text-indigo-600 hover:text-indigo-500 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 rounded"
			rel="noopener"
			>Download for -</a>
<a
			data-crabnebula
			class="text-xs font-medium text-indigo-600 hover:text-indigo-500 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 rounded"
			rel="noopener"
			>Download for -</a>
<a
			data-crabnebula
			class="text-xs font-medium text-indigo-600 hover:text-indigo-500 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 rounded"
			rel="noopener"
			>Download for -</a>
	</div>
	<script>
		function highlightUserOSButton() {
			const os = getOs();
			const downloadButtons = [
				{ os: "Windows", href: "https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/wix-x86_64", isFirst: os === "windows" },
				{ os: "Linux", href: "https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/appimage-x86_64", isFirst: os === "linux" },
				{ os: "MacOS (intel)", href: "https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/dmg-aarch64", isFirst: os === "macos-intel" },
				{ os: "MacOS (arm)", href: "https://cdn.crabnebula.app/download/pratyay/drawx/latest/platform/dmg-aarch64", isFirst: os === "macos-arm" }
			].sort((a, b) => (a.isFirst ? -1 : 1));

			document.querySelectorAll("[data-crabnebula]").forEach(($link, i) => {
				if (
					$link instanceof HTMLAnchorElement &&
					i < downloadButtons.length
				) {
					$link.innerHTML = `Download for ${downloadButtons[i].os}`;
					$link.href = downloadButtons[i].href;
				}
			});
		}

		function getOs() {
			const ua = navigator.userAgent;
			if (ua.includes("Windows")) return "windows";
			if (ua.includes("Linux")) return "linux";
			if (ua.includes("Macintosh")) {
				try {
					const canvas = document.createElement("canvas");
					const ctx = canvas.getContext("webgl");
					const debugInfo = ctx.getExtension("WEBGL_debug_renderer_info");
					const renderer = ctx.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
					return renderer.match(/(M1|M2|M3)/gm) ? "macos-arm" : "macos-intel";
				} catch {
					return "macos-intel";
				}
			}

			return "unknown";
		}

		highlightUserOSButton();
	</script>
</body>
</div>
