const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * Copy assets (images, icons, etc.) to dist folder
 */
function copyAssets() {
  const srcDir = path.join(__dirname, "images");
  const destDir = path.join(__dirname, "dist", "images");

  if (fs.existsSync(srcDir)) {
    // Create destination directory if it doesn't exist
    fs.mkdirSync(destDir, { recursive: true });

    // Copy all files from src to dest
    const files = fs.readdirSync(srcDir);
    files.forEach((file) => {
      const srcFile = path.join(srcDir, file);
      const destFile = path.join(destDir, file);
      fs.copyFileSync(srcFile, destFile);
    });
    console.log("[assets] copied images folder to dist/");
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });
  if (watch) {
    await ctx.watch();
    // Copy assets on first watch start
    copyAssets();
  } else {
    await ctx.rebuild();
    // Copy assets after build
    copyAssets();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
