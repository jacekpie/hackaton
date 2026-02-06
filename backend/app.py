import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from scanner import ScanState, Scanner


HOST = "127.0.0.1"
PORT = 5005


def create_app() -> Flask:
  logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
  )

  load_dotenv()  # loads backend/.env if present (not committed)

  app = Flask(__name__)
  CORS(app)

  state = ScanState()
  scanner = Scanner(state=state)

  scanner.start_background(interval_seconds=10)

  @app.get("/health")
  def health():
    return jsonify({"status": "ok"})

  @app.get("/api/status")
  def status():
    return jsonify(
      {
        "status": "ok",
        "last_scan_iso": state.last_scan_iso,
        "last_scan_error": state.last_scan_error,
        "api_key_configured": bool(os.getenv("OPENAI_API_KEY")),
        "model": os.getenv("OPENAI_MODEL", "gpt-4o"),
      }
    )

  @app.get("/api/sources")
  def sources():
    with scanner._lock:  # simple snapshot
      return jsonify({"sources": list(state.sources)})

  @app.get("/api/policies")
  def policies():
    with scanner._lock:
      return jsonify({"policies": list(state.policies)})

  @app.get("/api/violations")
  def violations():
    # Optional filtering
    source_id = request.args.get("sourceId")
    policy_id = request.args.get("policyId")

    with scanner._lock:
      items = list(state.violations)
    if source_id:
      items = [v for v in items if v.get("sourceId") == source_id]
    if policy_id:
      items = [v for v in items if v.get("policyId") == policy_id]

    return jsonify({"violations": items})

  @app.post("/api/scan")
  def trigger_scan():
    scanner.scan_once(force=True)
    return jsonify({"status": "ok"})

  # Mock upload policy endpoint (JSON)
  @app.post("/api/policies")
  def upload_policy():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or "").strip() or "Uploaded policy"
    text = str(data.get("text") or "").strip()
    created = scanner.add_policy(name=name, text=text)
    return jsonify({"policy": created}), 201

  # Mock delete policy endpoint
  @app.delete("/api/policies/<policy_id>")
  def delete_policy(policy_id: str):
    ok = scanner.delete_policy(policy_id)
    return jsonify({"deleted": ok})

  return app


if __name__ == "__main__":
  app = create_app()
  app.run(host=HOST, port=PORT, debug=True)

