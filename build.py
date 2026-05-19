"""
Netlify build script.
Runs once at deploy time: processes data files and writes everything
the browser needs into the `public/` directory.
"""

import json
import shutil
import sys
from pathlib import Path

ROOT   = Path(__file__).parent
PUBLIC = ROOT / "public"

# Ensure app.py data-loading paths resolve correctly
sys.path.insert(0, str(ROOT))
from app import build_payload, clean_json  # noqa: E402

# ── Create / reset public dir ─────────────────────────────────────────────────
PUBLIC.mkdir(exist_ok=True)

# ── Static assets ─────────────────────────────────────────────────────────────
static_dst = PUBLIC / "static"
if static_dst.exists():
    shutil.rmtree(static_dst)
shutil.copytree(ROOT / "static", static_dst)

# ── Report images (referenced directly from the HTML) ────────────────────────
reports_dst = PUBLIC / "reports"
if reports_dst.exists():
    shutil.rmtree(reports_dst)
shutil.copytree(ROOT / "reports", reports_dst)

# ── Data payload ──────────────────────────────────────────────────────────────
payload = clean_json(build_payload())
(PUBLIC / "data.json").write_text(json.dumps(payload), encoding="utf-8")
print(f"data.json written ({(PUBLIC / 'data.json').stat().st_size // 1024} KB)")

# ── index.html — convert Jinja template to plain HTML ────────────────────────
template = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
template = template.replace(
    "{{ url_for('static', filename='css/style.css') }}",
    "/static/css/style.css",
)
template = template.replace(
    "{{ url_for('static', filename='js/dashboard.js') }}",
    "/static/js/dashboard.js",
)
(PUBLIC / "index.html").write_text(template, encoding="utf-8")

print(f"Build complete: {PUBLIC}")
