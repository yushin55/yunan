// Local demo only. Never writes .env or uses a teammate's administrator credentials.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const action = process.argv[2] || 'check';
const actions = ['check', 'check-backend', 'emulators', 'backend', 'frontend'];
if (!actions.includes(action)) {
  console.error(`Usage: node scripts/team-local.mjs ${actions.join('|')}`);
  process.exit(2);
}
const python = path.join(root, 'backend/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const cli = path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js');
const vite = path.join(root, 'frontend/node_modules/vite/bin/vite.js');
const env = {
  ...process.env,
  FIREBASE_PROJECT_ID: 'demo-yunan',
  GCLOUD_PROJECT: 'demo-yunan', GOOGLE_CLOUD_PROJECT: 'demo-yunan',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: '', GOOGLE_APPLICATION_CREDENTIALS: '',
  ENVIRONMENT: 'development', MODERATION_MODE: 'rules', GEMINI_API_KEY: '',
  ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-yunan.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-yunan', VITE_FIREBASE_APP_ID: 'demo-app',
  VITE_API_BASE_URL: 'http://127.0.0.1:8000',
  VITE_USE_FIREBASE_EMULATORS: 'true', NODE_ENV: 'development',
};
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) console.error('Cannot start local tool; check installation and execution permissions.');
  process.exit(result.status ?? 1);
}
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('Use Node 24 or newer (validated with Node 24).');
  process.exit(1);
}
const required = action === 'emulators' ? [cli] : action === 'frontend' ? [vite] :
  ['backend', 'check-backend'].includes(action) ? [python] : [python, cli, vite];
const missing = required.filter(file => !existsSync(file));
if (missing.length) {
  console.error('Missing local dependencies. Follow docs/team-local-start.ko.md first.');
  process.exit(1);
}
if (action === 'check') {
  console.log('PASS: Node version and local dependency paths. No cloud requests or environment file changes.');
  console.log('Next: check-backend, then emulators/backend/frontend in three separate terminals.');
} else if (action === 'check-backend') {
  run(python, ['-c', [
    'import sys',
    'assert (3, 11) <= sys.version_info[:2] < (3, 14)',
    'from app.core.firebase import firebase_app, validate_environment',
    'from app.core.config import settings',
    'from google.auth.credentials import AnonymousCredentials',
    'validate_environment()',
    "assert settings.project_id == 'demo-yunan'",
    "assert settings.environment == 'development' and settings.moderation_mode == 'rules'",
    'assert not settings.service_account and not settings.gemini_api_key',
    'assert isinstance(firebase_app().credential.get_credential(), AnonymousCredentials)',
    "print('PASS: Python, backend imports, demo configuration and anonymous emulator credential. No network requests.')",
  ].join('\n')], path.join(root, 'backend'));
} else if (action === 'emulators') {
  const java = spawnSync('java', ['-version'], { env, encoding: 'utf8' });
  const version = `${java.stdout || ''} ${java.stderr || ''}`.match(/version\s+"(\d+)/);
  if (java.status !== 0 || !version || Number(version[1]) < 21) {
    console.error('Java 21+ is required. Set JAVA_HOME and PATH in this terminal, then retry.');
    process.exit(1);
  }
  run(process.execPath, [cli, 'emulators:start', '--project', 'demo-yunan', '--only', 'auth,firestore']);
} else if (action === 'backend') {
  run(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000', '--no-access-log'], path.join(root, 'backend'));
} else {
  run(process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], path.join(root, 'frontend'));
}
