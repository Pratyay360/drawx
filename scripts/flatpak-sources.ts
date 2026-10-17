#!/usr/bin/env bun
/**
 * Regenerate the Flatpak Node sources (`flatpak/generated-sources.json`) from
 * the Bun text lockfile (`bun.lock`).
 *
 * This wraps `flatpak-bun-generator` (https://github.com/MultiboxLabs/flatpak-bun-generator)
 * and works around two of its limitations:
 *
 * 1. Version gate
 *    The generator rejects any lockfile whose top-level `lockfileVersion` is
 *    not 1. Bun writes 2 (or 3 when scoped overrides exist), but v1 -> v2 -> v3
 *    are not content changes: the newer versions only add stricter parse-time
 *    validation inside Bun itself, and the written `packages` records keep the
 *    same shape in every version (`[ "name@version", registry, meta, integrity ]`).
 *    See bun: src/install/lockfile/bun.lock.rs, the `Version::V2` doc comment.
 *    We therefore feed the generator a v1-labelled *copy* of the lockfile.
 *
 * 2. Cache layout
 *    The generator emits npm packages as `type: file` sources that drop a
 *    `package.tgz` into `bun_cache/<name>@<version>@@@1/`. Bun's offline
 *    installer validates a cache entry by the presence of `package.json`
 *    (`is_package_in_cache_at`), so an unextracted `package.tgz` is a cache
 *    miss and `bun install --offline` fails. We rewrite every npm tarball
 *    source to `type: archive` with `strip-components: 1`, so flatpak-builder
 *    extracts the tarball straight into the cache layout Bun expects.
 *
 * Usage:
 *   bun scripts/flatpak-sources.ts [lockfile] [generator flags...]
 *
 * The optional first argument is the lockfile to read (default: bun.lock).
 * Remaining flags pass through to the generator (--all-os, --no-devel,
 * --registry <url>). If --output is not given it defaults to
 * flatpak/generated-sources.json.
 *
 * The generator version can be overridden with FLATPAK_BUN_GENERATOR.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const generator =
	Bun.env.FLATPAK_BUN_GENERATOR ?? "flatpak-bun-generator@latest";

const DEFAULT_LOCKFILE = "bun.lock";
const DEFAULT_OUTPUT = "flatpak/generated-sources.json";
const NPM_CACHE_PREFIX = "bun_cache/";

type FlatpakSource = Record<string, unknown>;

/** Rewrite only the top-level `lockfileVersion`; the rest passes through verbatim. */
export function relabelToV1(text: string): string {
	return text.replace(
		/("lockfileVersion"\s*:\s*)\d+/,
		(_match, prefix: string) => `${prefix}1`,
	);
}

/** True for the `package.tgz` sources the generator drops into Bun's npm cache. */
export function isNpmTarballSource(source: FlatpakSource): boolean {
	return (
		source.type === "file" &&
		typeof source.dest === "string" &&
		source.dest.startsWith(NPM_CACHE_PREFIX) &&
		source["dest-filename"] === "package.tgz"
	);
}

/** Turn a cached npm tarball into an archive flatpak-builder extracts in place. */
export function toArchiveSource(source: FlatpakSource): FlatpakSource {
	const { "dest-filename": _dropped, ...rest } = source;
	return { ...rest, type: "archive", "strip-components": 1 };
}

/** Read `--output <path>` / `--output=<path>` out of the pass-through flags. */
function requestedOutput(args: string[]): string | undefined {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--output") return args[i + 1];
		if (arg?.startsWith("--output=")) return arg.slice("--output=".length);
	}
	return undefined;
}

async function main(): Promise<void> {
	const args = Bun.argv.slice(2);
	let lockfile = DEFAULT_LOCKFILE;
	if (args[0] && !args[0].startsWith("-")) {
		lockfile = args.shift() as string;
	}

	const lockfilePath = resolve(repoRoot, lockfile);
	if (!(await Bun.file(lockfilePath).exists())) {
		throw new Error(`lockfile not found: ${lockfile}`);
	}

	const customOutput = requestedOutput(args);
	const output = customOutput ?? DEFAULT_OUTPUT;
	const staging = mkdtempSync(join(tmpdir(), "flatpak-sources-"));
	const stagedLockfile = join(staging, "bun.lock");
	const generatorArgs = [stagedLockfile, ...args];
	if (customOutput === undefined) {
		generatorArgs.push("--output", output);
	}

	try {
		writeFileSync(
			stagedLockfile,
			relabelToV1(readFileSync(lockfilePath, "utf8")),
		);

		console.log(
			`Generating Flatpak sources from ${lockfile} (v1-labelled copy)...`,
		);
		const proc = Bun.spawn(["bunx", generator, ...generatorArgs], {
			cwd: repoRoot,
			stdio: ["inherit", "inherit", "inherit"],
		});
		if ((await proc.exited) !== 0) {
			throw new Error(
				`flatpak-bun-generator exited with code ${proc.exitCode}`,
			);
		}
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}

	const outputPath = resolve(repoRoot, output);
	const sources = JSON.parse(
		readFileSync(outputPath, "utf8"),
	) as FlatpakSource[];
	let converted = 0;
	const patched = sources.map((source) => {
		if (!isNpmTarballSource(source)) return source;
		converted++;
		return toArchiveSource(source);
	});

	await Bun.write(outputPath, `${JSON.stringify(patched, null, 2)}\n`);
	console.log(
		`Unpacked ${converted} npm tarballs via type: archive -> ${output}`,
	);
}

await main();
