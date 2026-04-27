import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const warnings = [];

const requiredFiles = [
  '.cursor/rules/workflow-push-deploy.mdc',
  '.editorconfig',
  '.github/workflows/workspace-check.yml',
  '.gitignore',
  '.nvmrc',
  '.vscode/extensions.json',
  '.vscode/settings.json',
  'AGENTS.md',
  'PROJECT_SOURCE_OF_TRUTH.md',
  'README.md',
  'docs/repo-comparison.md',
  'package-lock.json',
  'package.json',
  'scripts/check-workspace.mjs',
];

const ignoredDirs = new Set([
  '.codex',
  '.git',
  '.github',
  '.vs',
  '.wrangler',
  'artifacts',
  'bin',
  'dist',
  'node_modules',
  'obj',
  'out',
  'packages',
  'publish',
  'TestResults',
]);

const textExtensions = new Set([
  '',
  '.cs',
  '.csproj',
  '.editorconfig',
  '.json',
  '.jsonc',
  '.md',
  '.mdc',
  '.mjs',
  '.sln',
  '.slnx',
  '.txt',
  '.xaml',
  '.xml',
  '.yaml',
  '.yml',
]);

const read = (path) => readFileSync(join(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

const includesAll = (path, phrases) => {
  const content = read(path);
  for (const phrase of phrases) {
    assert(content.includes(phrase), `${path} missing required phrase: ${phrase}`);
  }
};

for (const path of requiredFiles) {
  assert(existsSync(join(root, path)), `${path} is missing`);
}

const pkg = readJson('package.json');
assert(pkg.private === true, 'package.json must stay private');
assert(pkg.type === 'module', 'package.json must use ESM for repo checks');
assert(pkg.engines?.node === '>=20.0.0', 'package.json must require Node >=20.0.0');
assert(pkg.scripts?.check === 'npm run check:workspace', 'check script must call check:workspace');
assert(
  pkg.scripts?.['check:workspace'] === 'node scripts/check-workspace.mjs',
  'check:workspace must run scripts/check-workspace.mjs',
);
assert(
  pkg.scripts?.['check:changed'] === 'npm run check:workspace',
  'check:changed must stay wired to workspace checks',
);

const requiredExtensions = [
  'openai.chatgpt',
  'ms-dotnettools.csharp',
  'ms-dotnettools.csdevkit',
  'ms-dotnettools.vscode-dotnet-runtime',
  'ms-vscode.powershell',
  'ms-vscode.cpptools',
  'ms-vscode.cmake-tools',
  'redhat.vscode-xml',
  'visualstudioexptteam.vscodeintellicode',
  'github.vscode-github-actions',
  'cloudflare.cloudflare-workers-bindings-extension',
];

const extensions = readJson('.vscode/extensions.json');
for (const id of requiredExtensions) {
  assert(
    extensions.recommendations?.includes(id),
    `.vscode/extensions.json missing recommendation: ${id}`,
  );
}
for (const id of [
  'JohannesVoderholzer.codex-model-integration',
  'expo.vscode-expo-tools',
  'msjsdiag.vscode-react-native',
]) {
  assert(
    extensions.unwantedRecommendations?.includes(id),
    `.vscode/extensions.json must keep unwanted recommendation: ${id}`,
  );
}

const settings = readJson('.vscode/settings.json');
assert(settings['chatgpt.runCodexInWindowsSubsystemForLinux'] === true, 'Codex must run in WSL');
assert(settings['chatgpt.openOnStartup'] === true, 'Codex side bar must open on startup');
assert(settings['chatgpt.commentCodeLensEnabled'] === true, 'Codex CodeLens must be enabled');
assert(settings['[csharp]']?.['editor.defaultFormatter'] === 'ms-dotnettools.csharp', 'C# formatter is not locked');
assert(settings['[xml]']?.['editor.defaultFormatter'] === 'redhat.vscode-xml', 'XML formatter is not locked');
assert(
  settings['dotnet.completion.showCompletionItemsFromUnimportedNamespaces'] === true,
  'unimported namespace completion must stay enabled',
);
for (const path of ['**/bin/**', '**/obj/**', '**/.vs/**', '**/artifacts/**', '**/out/**']) {
  assert(settings['files.watcherExclude']?.[path] === true, `watcher exclude missing: ${path}`);
}
for (const path of ['**/bin', '**/obj', '**/.vs', '**/artifacts', '**/out']) {
  assert(settings['search.exclude']?.[path] === true, `search exclude missing: ${path}`);
}

includesAll('AGENTS.md', [
  'Every agent run in this repo must follow this order',
  'Windows application development workspace',
  'Never commit GitHub tokens',
]);

includesAll('PROJECT_SOURCE_OF_TRUTH.md', [
  'Windows application development',
  'Custom App Development',
  'Every run must fix all known issues',
  'Leave a clean repo every time',
  'All agents must follow this order at all times',
]);

includesAll('.cursor/rules/workflow-push-deploy.mdc', [
  'alwaysApply: true',
  'Windows application development',
  'git push origin main',
  'Never commit personal access tokens',
]);

includesAll('README.md', [
  'Windows app development workspace',
  'Custom App Development',
  'npm run check:workspace',
]);

includesAll('.gitignore', [
  '.env',
  '.codex',
  'bin/',
  'obj/',
  'artifacts/',
  '*.msix',
]);

includesAll('.github/workflows/workspace-check.yml', [
  'npm ci',
  'npm run check:workspace',
]);

const collectTextFiles = (dir, prefix = '') => {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = join(root, relativePath);

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...collectTextFiles(fullPath, relativePath));
      }
      continue;
    }

    if (!entry.isFile()) continue;
    if (statSync(fullPath).size > 2_000_000) continue;

    const extension = extname(entry.name);
    if (textExtensions.has(extension) || entry.name.startsWith('.')) {
      files.push(relativePath);
    }
  }
  return files;
};

const forbiddenPatterns = [
  { label: 'GitHub token', pattern: new RegExp('gh' + '[pousr]_[A-Za-z0-9_]{20,}') },
  { label: 'GitHub fine-grained token', pattern: new RegExp('github_' + 'pat_[A-Za-z0-9_]{20,}') },
  { label: 'OpenAI key', pattern: new RegExp('sk-' + '[A-Za-z0-9]{20,}') },
  { label: 'placeholder repo slug', pattern: new RegExp('X'.repeat(6)) },
];

for (const file of collectTextFiles(root)) {
  const content = read(file);
  for (const { label, pattern } of forbiddenPatterns) {
    assert(!pattern.test(content), `${label} found in ${file}`);
  }
}

if (
  !existsSync(join(root, 'wrangler.toml')) &&
  !existsSync(join(root, 'wrangler.json')) &&
  !existsSync(join(root, 'wrangler.jsonc'))
) {
  warnings.push('No Cloudflare/Wrangler deploy config exists yet; deploy is intentionally skipped.');
}

if (
  !readdirSync(root).some((entry) =>
    entry.endsWith('.sln') ||
    entry.endsWith('.slnx') ||
    entry.endsWith('.csproj') ||
    entry.endsWith('.vbproj') ||
    entry.endsWith('.fsproj'),
  )
) {
  warnings.push('No Windows app solution/project file exists yet; workspace checks only validate repo policy.');
}

if (warnings.length > 0) {
  console.warn('Workspace check warnings:');
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length > 0) {
  console.error('Workspace check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Workspace check passed.');
