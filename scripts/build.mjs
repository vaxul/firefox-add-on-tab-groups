// Bundles the extension into dist/ and stamps the package.json version into the
// manifest, so package.json is the single source of the version number.
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: { background: "src/background/index.ts", popup: "src/popup/index.ts" },
  bundle: true,
  format: "esm",
  target: "firefox140",
  outdir,
  logLevel: "warning",
});

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("src/manifest.json", "utf8"));
manifest.version = pkg.version;
await writeFile(`${outdir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

await cp("src/_locales", `${outdir}/_locales`, { recursive: true });
await cp("src/popup/popup.html", `${outdir}/popup.html`);
await cp("src/shared/tokens.css", `${outdir}/tokens.css`);
