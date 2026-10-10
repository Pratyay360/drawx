// Bumps the patch version of the app in every place it is tracked and prints
// the new version to stdout. Used by the release workflow before drafting a
// CrabNebula Cloud release, so every push to main produces a new version.
import { readFileSync, writeFileSync } from "node:fs";

function bumpPatch(version) {
	const [major, minor, patch] = version.split(".").map(Number);
	if ([major, minor, patch].some(Number.isNaN)) {
		throw new Error(`Cannot bump non-semver version: ${version}`);
	}
	return `${major}.${minor}.${patch + 1}`;
}

// tauri.conf.json is the source of truth (CrabNebula reads the release
// version from it); the other files are kept in sync.
const confPath = "src-tauri/tauri.conf.json";
const conf = JSON.parse(readFileSync(confPath, "utf8"));
const current = conf.version;
if (!current) throw new Error("No version found in tauri.conf.json");
const next = bumpPatch(current);

conf.version = next;
writeFileSync(confPath, `${JSON.stringify(conf, null, "\t")}\n`);

const pkgPath = "package.json";
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8");
const nextCargo = cargo.replace(/^version = "[^"]*"$/m, `version = "${next}"`);
if (nextCargo === cargo)
	throw new Error("Could not bump version in Cargo.toml");
writeFileSync(cargoPath, nextCargo);

const lockPath = "src-tauri/Cargo.lock";
const lock = readFileSync(lockPath, "utf8");
const nextLock = lock.replace(
	/name = "drawx"\nversion = "[^"]*"/,
	`name = "drawx"\nversion = "${next}"`,
);
if (nextLock === lock) throw new Error("Could not bump version in Cargo.lock");
writeFileSync(lockPath, nextLock);

console.log(next);
