import * as Sentry from "@sentry/react";
import { isTauri } from "../services/tauri.ts";

let initialized = false;

export function initSentry(): void {
	if (initialized) return;
	initialized = true;
	if (isTauri()) return;
	Sentry.init({
		dsn: "https://41990cc48e061c70a5a043e635b63eb6@o4510758181208064.ingest.de.sentry.io/4512250072268880",
		environment: "production",
		integrations: [Sentry.browserTracingIntegration()],
		tracesSampleRate: 1.0,
		tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
		debug: import.meta.env.DEV,
	});
	if (import.meta.env.DEV) {
		(globalThis as { Sentry?: typeof Sentry }).Sentry = Sentry;
	}
}

export { Sentry };
