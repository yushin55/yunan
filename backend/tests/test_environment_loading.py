"""Exercise the actual config loader in a fresh process with an isolated .env."""
import os
from pathlib import Path
import shutil
import subprocess
import sys


def test_dotenv_loading_and_process_precedence(tmp_path):
    backend = tmp_path / "backend"
    core = backend / "app" / "core"
    core.mkdir(parents=True)
    source = Path(__file__).resolve().parents[1] / "app/core/config.py"
    shutil.copyfile(source, core / "config.py")
    (backend / ".env").write_text(
        "FIREBASE_PROJECT_ID=dotenv-test-project\n"
        "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64=dotenv-test-marker\n"
        "ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\n"
        "ENVIRONMENT=development\nMODERATION_MODE=rules\n"
        "GEMINI_API_KEY=dotenv-test-marker\n", encoding="utf-8",
    )
    (backend / ".env.production").write_text("FIREBASE_PROJECT_ID=must-not-load\n")
    env = os.environ.copy()
    for key in ("FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64", "ALLOWED_ORIGINS", "ENVIRONMENT", "MODERATION_MODE", "GEMINI_API_KEY"):
        env.pop(key, None)
    script = (
        "import runpy,sys; s=runpy.run_path(sys.argv[1])['settings']; "
        "assert s.project_id == sys.argv[2]; "
        "assert s.environment == 'development' and s.moderation_mode == 'rules'; "
        "assert s.allowed_origins == ('http://localhost:5173','http://127.0.0.1:5173'); "
        "assert s.service_account == 'dotenv-test-marker'; "
        "assert s.gemini_api_key == 'dotenv-test-marker'"
    )
    for project in ("dotenv-test-project", "process-test-project"):
        if project.startswith("process"):
            env["FIREBASE_PROJECT_ID"] = project
        result = subprocess.run([sys.executable, "-c", script, str(core / "config.py"), project], env=env, capture_output=True, timeout=20)
        assert result.returncode == 0, "Isolated backend environment loading failed (values suppressed)"
