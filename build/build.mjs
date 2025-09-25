import { build, context as createContext } from 'esbuild';
import { mkdir, rm, writeFile, copyFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, '..');
const outdir = join(rootDir, 'dist');

async function copyPublicAssets() {
  // Icons
  const iconsDest = join(outdir, 'icons');
  await mkdir(iconsDest, { recursive: true });
  const iconSizes = ['icon16.png', 'icon48.png', 'icon128.png'];
  await Promise.all(iconSizes.map(async (icon) => {
    await copyFile(join(rootDir, 'icons', icon), join(iconsDest, icon));
  }));

  // Options static assets (HTML + CSS)
  const optionsSrc = join(rootDir, 'options');
  const optionsDest = join(outdir, 'options');
  await mkdir(optionsDest, { recursive: true });
  await copyFile(join(optionsSrc, 'options.html'), join(optionsDest, 'options.html'));
  await copyFile(join(optionsSrc, 'options.css'), join(optionsDest, 'options.css'));

  const manifestJson = JSON.parse(await readFile(join(rootDir, 'manifest.json'), 'utf-8'));
  await writeFile(join(outdir, 'manifest.json'), JSON.stringify(manifestJson, null, 2));
}

const copyStaticPlugin = {
  name: 'copy-static-assets',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      try {
        await copyPublicAssets();
      } catch (err) {
        console.error('Asset copy failed', err);
      }
    });
  }
};

async function run({ watch = false } = {}) {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  const buildOptions = {
    entryPoints: {
      'scripts/background': 'src/scripts/background.js',
      'scripts/content_script': 'src/scripts/content_script.js',
      'scripts/site_selectors': 'src/scripts/site_selectors.js',
      'options/options': 'src/options/options.js'
    },
    bundle: true,
    outdir,
    format: 'esm',
    sourcemap: true,
    target: 'es2020',
    minify: false,
    platform: 'browser',
    loader: {
      '.js': 'js'
    },
    logLevel: 'info',
    absWorkingDir: rootDir,
    plugins: [copyStaticPlugin]
  };

  if (watch) {
    const ctx = await createContext(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await build(buildOptions);
  }
}

const watchMode = process.argv.includes('--watch');
run({ watch: watchMode }).catch((err) => {
  console.error(err);
  process.exit(1);
});
