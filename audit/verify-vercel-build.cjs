// Optional local packaging check. Install tools into the ignored audit cache:
// npm install --prefix .audit-cache/vercel-tools --ignore-scripts @vercel/node @vercel/build-utils @vercel/routing-utils
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pipeline } = require("node:stream/promises");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const tool = (name) =>
  require(path.join(root, ".audit-cache/vercel-tools/node_modules", name));
(async () => {
  await require("./validate-vercel-config.cjs").validateVercelConfig();
  const config = require("../vercel.json");
  // Package a clean source tree, like a Git-based Vercel deployment. This also
  // avoids tracing retained, ignored V2 database files in the local workspace.
  const workPath = path.join(
    root,
    ".audit-cache",
    "vercel-build-" + Date.now(),
  );
  fs.mkdirSync(workPath, { recursive: true });
  const paths = execFileSync(
    "git",
    [
      "-c",
      `safe.directory=${root.replaceAll("\\", "/")}`,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  for (const file of paths) {
    if (!fs.existsSync(path.join(root, file))) continue;
    const destination = path.join(workPath, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "ci",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      path.join(root, ".npm-cache"),
    ],
    { cwd: workPath, stdio: "inherit", shell: process.platform === "win32" },
  );
  const routes = tool("@vercel/routing-utils").getTransformedRoutes(config);
  assert.equal(routes.error, null);
  const { FileFsRef } = tool("@vercel/build-utils");
  const result = await tool("@vercel/node").build({
    files: {
      "api/handler.js": new FileFsRef({
        fsPath: path.join(workPath, "api/handler.js"),
      }),
    },
    entrypoint: "api/handler.js",
    workPath,
    meta: { isDev: true },
    considerBuildCommand: true,
    config: {
      ...config.functions["api/handler.js"],
      zeroConfig: true,
      projectSettings: {
        installCommand: "",
        buildCommand: "",
        nodeVersion: "22.x",
      },
    },
  });
  const files = Object.keys(result.output.files).map((p) =>
    p.replaceAll("\\", "/"),
  );
  assert.ok(files.includes("server/migrations/postgres/001_v3.sql"));
  assert.ok(files.includes("server/postgres.cjs"));
  assert.ok(files.includes("shared/options.json"));
  assert.ok(files.some((p) => p.includes("node_modules/pg/lib/index.js")));
  const unwanted = files.filter(
    (p) => p.startsWith("server/data/") || p.startsWith(".audit-cache/"),
  );
  assert.deepEqual(unwanted, []);
  // Execute the packaged files outside the repository so missing dependencies
  // cannot be satisfied accidentally by the workspace's node_modules.
  const bundlePath = fs.mkdtempSync(
    path.join(os.tmpdir(), "coffee-vercel-runtime-"),
  );
  try {
    for (const [relative, file] of Object.entries(result.output.files)) {
      const destination = path.resolve(bundlePath, relative);
      assert.ok(destination.startsWith(path.resolve(bundlePath) + path.sep));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await pipeline(file.toStream(), fs.createWriteStream(destination));
    }
    execFileSync(
      process.execPath,
      [
        "--no-experimental-require-module",
        path.join(root, "tests/runtime-smoke.cjs"),
        bundlePath,
      ],
      {
        cwd: bundlePath,
        env: {
          ...process.env,
          VERCEL: "1",
          DATABASE_URL: "",
          ADMIN_TOKEN: "",
          ADMIN_TOKENS: "{}",
          NODE_PATH: "",
        },
        stdio: "inherit",
        timeout: 15000,
      },
    );
  } finally {
    assert.equal(
      path.dirname(path.resolve(bundlePath)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(bundlePath).startsWith("coffee-vercel-runtime-"));
    fs.rmSync(bundlePath, { recursive: true, force: true });
  }
  const evidence = {
    runtime: result.output.runtime,
    handler: result.output.handler,
    fileCount: files.length,
    postgresMigrationBundled: true,
    localDataExcluded: true,
    packagedRuntimeStartup: true,
    requireEsmDisabled: true,
    routes: routes.routes,
  };
  fs.writeFileSync(
    path.join(__dirname, "vercel-package.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
