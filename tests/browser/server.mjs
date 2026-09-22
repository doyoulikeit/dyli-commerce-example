import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const output = process.env.VERIFY_OUTPUT;
if (!output || !process.env.ESBUILD_PACKAGE_PATH)
  throw Error(
    "Set VERIFY_OUTPUT and ESBUILD_PACKAGE_PATH to your temporary verification dependencies",
  );
const { build } = await import(process.env.ESBUILD_PACKAGE_PATH);
const revealOnly = process.env.VERIFY_VIEW === "reveal";
const offersOnly = process.env.VERIFY_VIEW === "offers";
const isolated = revealOnly || offersOnly;
await build({
  entryPoints: { harness: path.join(root, `tests/browser/${offersOnly ? "offer-preview" : revealOnly ? "reveal-preview" : "harness"}.jsx`) },
  bundle: true,
  outdir: output,
  format: "esm",
  jsx: "automatic",
  tsconfig: path.join(root, "tsconfig.json"),
  alias: {
    "@privy-io/react-auth": path.join(root, "tests/browser/privy.fixture.jsx"),
  },
  define: {
    "process.env": "{}",
    "process.env.NODE_ENV": '"development"',
    "process.env.NEXT_PUBLIC_BOXES_ONLY": '"false"',
    "process.env.NEXT_PUBLIC_DEMO_MODE": '"false"',
    "process.env.NEXT_PUBLIC_SPONSOR_TRANSACTIONS": '"false"',
    "process.env.NEXT_PUBLIC_STOREFRONT_NAME": '"Vaulted"',
  },
  plugins: [
    {
      name: "css-without-tailwind-preprocessor",
      setup(build) {
        build.onLoad({ filter: /globals\.css$/ }, async (args) => ({
          contents: (await readFile(args.path, "utf8")).replace(
            '@import "tailwindcss";',
            "",
          ),
          loader: "css",
        }));
      },
    },
  ],
});
if (process.env.VERIFY_BUILD_ONLY !== "true") http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (revealOnly && url.pathname === "/fixtures/reveal") {
        const response = await fetch("https://www.dyli.io/api/public/box-ranges?boxId=12997&includeItems=true&pageSize=2", { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error("Read-only box artwork unavailable");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(await response.json()));
        return;
      }
      if (isolated && (url.pathname.startsWith("/api/") || req.method !== "GET")) {
        res.writeHead(405);
        res.end("This preview cannot submit transactions.");
        return;
      }
      if (
        url.pathname === "/fixtures/catalog" ||
        /^\/fixtures\/box\/\d+$/.test(url.pathname)
      ) {
        const source =
          url.pathname === "/fixtures/catalog"
            ? "/api/storefront"
            : "/api/boxes/" + url.pathname.split("/").pop();
        const response = await fetch(`http://localhost:3107${source}`);
        const data = await response.json();
        if (!response.ok) throw Error("Read-only fixture source unavailable");
        if (data.catalog) {
          data.catalog = data.catalog.slice(0, 4);
          data.boxes = data.boxes.slice(0, 3);
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
        return;
      }
      if (["/harness.js", "/harness.css"].includes(url.pathname)) {
        res.setHeader(
          "Content-Type",
          url.pathname.endsWith(".css") ? "text/css" : "text/javascript",
        );
        res.end(await readFile(path.join(output, url.pathname.slice(1))));
        return;
      }
      if (url.pathname === "/dyli-logo.svg") {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(await readFile(path.join(root, "public/dyli-logo.svg")));
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vaulted isolated browser verification</title><link rel="stylesheet" href="/harness.css"><style>body{font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>',
      );
    } catch (error) {
      res.statusCode = 500;
      res.end(error.message);
    }
  })
  .listen(offersOnly ? 3110 : revealOnly ? 3109 : 3108, "127.0.0.1", () =>
    console.log(
      `Isolated fixture server http://localhost:${offersOnly ? 3110 : revealOnly ? 3109 : 3108}; wallet sends and API writes are simulated, catalog reads only.`,
    ),
  );
