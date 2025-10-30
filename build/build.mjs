import { build, context as createContext } from 'esbuild';
import { mkdir, rm, writeFile, copyFile, readFile, readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const rootDir = join(__dirname, '..');
const target = (process.argv.find((a) => a.startsWith('--target=')) || '').split('=')[1] || 'chrome';
const outBase = join(rootDir, 'dist');
const outdir = join(outBase, target);

async function copyDirectory(src, dest) {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });

  await Promise.all(entries.map(async (entry) => {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }));
}

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

  const assetsSrc = join(rootDir, 'assets');
  const assetsDest = join(outdir, 'assets');
  await copyDirectory(assetsSrc, assetsDest);

  // Copy webextension polyfill to root of outdir
  const polyfillSrc = join(rootDir, 'node_modules', 'webextension-polyfill', 'dist', 'browser-polyfill.js');
  try {
    await access(polyfillSrc);
    await copyFile(polyfillSrc, join(outdir, 'browser-polyfill.js'));
  } catch (e) {
    console.warn('Polyfill not found at', polyfillSrc, '— ensure dependencies are installed.');
  }

  // Transform manifest per target
  const manifestPath = join(rootDir, 'manifest.json');
  const manifestJson = JSON.parse(await readFile(manifestPath, 'utf-8'));

  // Ensure polyfill is loaded first in content scripts
  if (Array.isArray(manifestJson.content_scripts)) {
    manifestJson.content_scripts = manifestJson.content_scripts.map((cs) => {
      const jsList = Array.isArray(cs.js) ? cs.js : [];
      const withPolyfill = ['browser-polyfill.js', ...jsList.filter((p) => p !== 'browser-polyfill.js')];
      return { ...cs, js: withPolyfill };
    });
  }

  if (target === 'firefox') {
    // Use background.scripts with module type; add gecko settings
    manifestJson.background = {
      scripts: ['browser-polyfill.js', 'scripts/background.js'],
      type: 'module'
    };
    manifestJson.browser_specific_settings = manifestJson.browser_specific_settings || {};
    manifestJson.browser_specific_settings.gecko = {
      id: manifestJson?.browser_specific_settings?.gecko?.id || 'tributary@local',
      strict_min_version: '121.0'
    };
  } else {
    // Chrome: keep service_worker; ensure type module remains
    if (!manifestJson.background || !manifestJson.background.service_worker) {
      manifestJson.background = {
        service_worker: 'scripts/background.js',
        type: 'module'
      };
    }
  }

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
      'scripts/background': 'src/scripts/background.ts',
      'scripts/content_script': 'src/scripts/content_script.ts',
      // Site registry + providers (TypeScript files, needed for dynamic imports)
      'scripts/sites/index': 'src/scripts/sites/index.ts',
      'scripts/sites/twitter': 'src/scripts/sites/twitter.ts',
      'scripts/sites/youtube': 'src/scripts/sites/youtube.ts',
      'scripts/sites/reddit': 'src/scripts/sites/reddit.ts',
      'scripts/sites/github': 'src/scripts/sites/github.ts',
      'scripts/sites/generic': 'src/scripts/sites/generic.ts',
      'options/options': 'src/options/options.ts'
    },
    bundle: true,
    outdir,
    format: 'esm',
    sourcemap: true,
    target: 'es2020',
    platform: 'browser',
    loader: {
      '.js': 'js',
      '.ts': 'ts'
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
