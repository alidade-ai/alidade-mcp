import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
if (manifest.version !== version) {
  throw new Error(`manifest.json version ${manifest.version} != package.json ${version}`);
}

const staging = ".mcpb-build";
rmSync(staging, { recursive: true, force: true });
mkdirSync(`${staging}/server`, { recursive: true });
cpSync("manifest.json", `${staging}/manifest.json`);
cpSync("dist/cli.js", `${staging}/server/cli.js`);
cpSync("LICENSE", `${staging}/LICENSE`);

const mcpb = "node_modules/.bin/mcpb";
execFileSync(mcpb, ["validate", `${staging}/manifest.json`], { stdio: "inherit" });
execFileSync(mcpb, ["pack", staging, `alidade-${version}.mcpb`], { stdio: "inherit" });
rmSync(staging, { recursive: true, force: true });
