import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from openai import OpenAI


DATA_DIR = Path(__file__).parent / "data"
POLICIES_DIR = DATA_DIR / "policies"
GOOGLE_DRIVE_DOC = DATA_DIR / "sources" / "google_drive" / "user_journey.txt"

logger = logging.getLogger("dont_get_fined_ai.scanner")

MAX_LOG_CHARS = int(os.getenv("LOG_LLM_MAX_CHARS", "8000"))

RETENTION_REGEX = r"(retain(ing)?\s+forever|retain(ing)?\s+indefinitely|keep\s+forever|stay\s+forever|cannot\s+delete|can\s*NOT\s+.*delete|no\s+chance\s+to\s+delete)"


def now_iso() -> str:
  return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_text_doc(path: Path) -> str:
  """
  Backwards-compatible helper name. We now scan a plain .txt file for reliability.
  """
  return path.read_text(encoding="utf-8", errors="ignore").strip()

def _truncate(s: str, limit: int) -> str:
  if len(s) <= limit:
    return s
  return s[:limit] + f"\n\n...[truncated, total_chars={len(s)}]"


@dataclass
class ScanState:
  sources: List[Dict[str, Any]] = field(default_factory=list)
  policies: List[Dict[str, Any]] = field(default_factory=list)
  violations: List[Dict[str, Any]] = field(default_factory=list)
  last_scan_iso: Optional[str] = None
  last_scan_error: Optional[str] = None
  _doc_mtime: Optional[float] = None
  _policies_mtime: Optional[float] = None


class Scanner:
  def __init__(self, state: ScanState):
    self.state = state
    self._lock = threading.Lock()
    self._thread: Optional[threading.Thread] = None
    self._stop = threading.Event()

    self._init_sources()
    self._load_policies_from_disk(force=True)
    self.scan_once(force=True)

  def _init_sources(self) -> None:
    self.state.sources = [
      {
        "id": "google-drive",
        "name": "Google Drive",
        "description": "Local .doc (pretend Drive)",
        "path": str(GOOGLE_DRIVE_DOC),
      }
    ]

  def _policies_max_mtime(self) -> Optional[float]:
    if not POLICIES_DIR.exists():
      return None
    mtimes: List[float] = []
    for p in POLICIES_DIR.glob("*.md"):
      try:
        mtimes.append(p.stat().st_mtime)
      except FileNotFoundError:
        continue
    return max(mtimes) if mtimes else None

  def _load_policies_from_disk(self, force: bool) -> bool:
    """
    Returns True if policies were reloaded.
    """
    latest = self._policies_max_mtime()
    if (not force) and self.state._policies_mtime is not None and latest is not None:
      if latest <= self.state._policies_mtime:
        return False

    policies: List[Dict[str, Any]] = []
    if POLICIES_DIR.exists():
      for p in sorted(POLICIES_DIR.glob("*.md")):
        policies.append(
          {
            "id": p.stem.replace("_", "-"),
            "name": p.stem.replace("_", " ").title(),
            "description": f"Loaded from disk: {p.name}",
            "version": "1.0",
            "updatedAtIso": now_iso(),
            "text": p.read_text(encoding="utf-8", errors="ignore"),
          }
        )
    self.state.policies = policies
    self.state._policies_mtime = latest
    return True

  def start_background(self, interval_seconds: int) -> None:
    if self._thread and self._thread.is_alive():
      return

    def loop():
      while not self._stop.is_set():
        try:
          self.scan_once(force=False)
        except Exception as e:  # noqa: BLE001
          with self._lock:
            self.state.last_scan_error = str(e)
        self._stop.wait(interval_seconds)

    self._thread = threading.Thread(target=loop, daemon=True)
    self._thread.start()

  def scan_once(self, force: bool) -> None:
    # Detect policy changes (disk) and trigger scan even if doc unchanged
    policies_changed = False
    with self._lock:
      try:
        policies_changed = self._load_policies_from_disk(force=False)
      except Exception as e:  # noqa: BLE001
        logger.exception("Failed to reload policies from disk: %s", e)
        policies_changed = False

      path = GOOGLE_DRIVE_DOC
      if not path.exists():
        self.state.last_scan_error = f"Missing source file: {path}"
        self.state.last_scan_iso = now_iso()
        return

      mtime = path.stat().st_mtime
      doc_changed = (
        self.state._doc_mtime is None or mtime > self.state._doc_mtime
      )
      if (not force) and (not policies_changed) and (not doc_changed):
        return

      self.state._doc_mtime = mtime
      existing = list(self.state.violations)
      existing_open = [v for v in existing if v.get("status", "OPEN") == "OPEN"]

    # Outside lock: do heavier work
    doc_text = read_text_doc(GOOGLE_DRIVE_DOC)
    policies = self.state.policies

    # Always show a short preview so it's obvious what content is being scanned.
    has_retention = bool(re.search(RETENTION_REGEX, doc_text, re.I))
    logger.info(
      "Document parsed (path=%s chars=%d) preview:\n%s",
      str(GOOGLE_DRIVE_DOC),
      len(doc_text),
      _truncate(doc_text, 400),
    )
    logger.info("Doc contains retention/no-delete phrase? %s", has_retention)

    # Optional full scan text logging
    if os.getenv("LOG_SCAN_TEXT", "0") == "1":
      logger.info(
        "Full scan text (doc=%s chars=%d):\n%s",
        str(GOOGLE_DRIVE_DOC),
        len(doc_text),
        _truncate(doc_text, MAX_LOG_CHARS),
      )

    if force or policies_changed or doc_changed:
      logger.info(
        "Scan triggered (force=%s doc_changed=%s policies_changed=%s)",
        force,
        doc_changed,
        policies_changed,
      )

    detected_open = self._analyze(doc_text=doc_text, policies=policies, existing_open=existing_open)
    updated, diff = self._reconcile(existing=existing, detected_open=detected_open)

    with self._lock:
      self.state.violations = updated
      self.state.last_scan_iso = now_iso()
      self.state.last_scan_error = None

    if diff["changed"]:
      logger.info(
        "Violations updated: +%d new, %d reopened, %d resolved (open=%d resolved=%d)",
        diff["new"],
        diff["reopened"],
        diff["resolved"],
        diff["open_count"],
        diff["resolved_count"],
      )
    else:
      logger.debug("No changes in violations list.")

  def add_policy(self, name: str, text: str) -> Dict[str, Any]:
    with self._lock:
      policy_id = f"uploaded-{int(time.time())}"
      p = {
        "id": policy_id,
        "name": name,
        "description": "Uploaded via API (mock)",
        "version": "1.0",
        "updatedAtIso": now_iso(),
        "text": text,
      }
      self.state.policies = [p, *self.state.policies]
      return p

  def delete_policy(self, policy_id: str) -> bool:
    with self._lock:
      before = len(self.state.policies)
      self.state.policies = [p for p in self.state.policies if p.get("id") != policy_id]
      return len(self.state.policies) != before

  def _analyze(
    self,
    doc_text: str,
    policies: List[Dict[str, Any]],
    existing_open: List[Dict[str, Any]],
  ) -> List[Dict[str, Any]]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
      logger.info("OPENAI_API_KEY not set; using heuristic detector (no LLM call).")
      return self._heuristic_violations(doc_text, policies, existing_open)

    try:
      llm = self._openai_violations(doc_text, policies, existing_open)
      if len(llm) == 0:
        logger.warning("LLM returned 0 open violations.")
      return llm
    except Exception as e:  # noqa: BLE001
      logger.exception("LLM call failed; falling back to heuristic detector: %s", e)
      return self._heuristic_violations(doc_text, policies, existing_open)

  def _heuristic_violations(
    self,
    doc_text: str,
    policies: List[Dict[str, Any]],
    existing_open: List[Dict[str, Any]],
  ) -> List[Dict[str, Any]]:
    # very simple signals
    email = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", doc_text, re.I)
    phone = re.search(r"\\+?\\d[\\d \\-()]{7,}\\d", doc_text)
    anyone_link = "anyone with the link" in doc_text.lower()
    token = re.search(r"sk_live_[A-Za-z0-9_\\-]{10,}", doc_text)
    retention = re.search(
      r"(retain(ing)?\\s+forever|retain(ing)?\\s+indefinitely|keep\\s+forever|stay\\s+forever|cannot\\s+delete|can\\s*NOT\\s+.*delete|no\\s+chance\\s+to\\s+delete)",
      doc_text,
      re.I,
    )
    logger.info(
      "Heuristic signals: email=%s phone=%s anyone_link=%s token=%s retention=%s",
      bool(email),
      bool(phone),
      anyone_link,
      bool(token),
      bool(retention),
    )

    policy_ids = {p.get("id") for p in policies}
    def pick(pid: str, fallback: str = "gdpr") -> str:
      return pid if pid in policy_ids else fallback

    out: List[Dict[str, Any]] = []
    existing_ids = {v.get("id") for v in existing_open if v.get("id")}

    if email or phone:
      out.append(
        {
          "id": "b-001" if "b-001" in existing_ids else "b-001",
          "title": "Possible personal data in document",
          "summary": "Detected patterns that look like email/phone.",
          "sourceId": "google-drive",
          "policyId": pick("gdpr"),
          "severity": "medium",
          "details": {
            "rule": "Avoid including personal data in broadly accessible documents.",
            "location": "Local doc (pretend Drive)",
            "evidence": f"Email: {email.group(0) if email else 'n/a'}; Phone: {phone.group(0) if phone else 'n/a'}",
            "recommendation": "Redact personal data and restrict access.",
          },
        }
      )
    if anyone_link:
      out.append(
        {
          "id": "b-002",
          "title": "Document appears to be shared publicly",
          "summary": "Found text indicating “Anyone with the link”.",
          "sourceId": "google-drive",
          "policyId": pick("access-control", "gdpr"),
          "severity": "high",
          "details": {
            "rule": "Access control: do not share personal data publicly.",
            "location": "Local doc (pretend Drive)",
            "evidence": "Matched phrase: “Anyone with the link”.",
            "recommendation": "Restrict sharing and move content to private folder.",
          },
        }
      )
    if token:
      out.append(
        {
          "id": "b-003",
          "title": "Secret/token-like string found",
          "summary": "Detected a token-like pattern in the document.",
          "sourceId": "google-drive",
          "policyId": pick("secrets-handling", "gdpr"),
          "severity": "high",
          "details": {
            "rule": "Secrets handling: never store tokens in shared docs.",
            "location": "Local doc (pretend Drive)",
            "evidence": f"Matched pattern: {token.group(0)[:12]}…",
            "recommendation": "Rotate token and remove from document.",
          },
        }
      )
    if retention:
      out.append(
        {
          "id": "b-004",
          "title": "Indefinite retention / no deletion mentioned",
          "summary": "Document suggests users cannot delete their data or data is retained forever.",
          "sourceId": "google-drive",
          "policyId": pick("data-retention", "gdpr"),
          "severity": "high",
          "details": {
            "rule": "Data retention: users must be able to request deletion; indefinite retention is not allowed by default.",
            "location": "Local doc (pretend Drive)",
            "evidence": f"Matched phrase: “{retention.group(0)}”",
            "recommendation": "Add deletion process and set retention periods; remove 'forever' retention statements.",
          },
        }
      )
    return out

  def _openai_violations(
    self,
    doc_text: str,
    policies: List[Dict[str, Any]],
    existing_open: List[Dict[str, Any]],
  ) -> List[Dict[str, Any]]:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    model = os.getenv("OPENAI_MODEL", "gpt-4o")
    logger.info(
      "LLM call starting: sending document + %d policies + %d existing open warnings (model=%s)",
      len(policies),
      len(existing_open),
      model,
    )

    policy_blob = "\n\n".join(
      [f"POLICY {p['id']} — {p['name']}\n{p.get('text','')}" for p in policies]
    )
    existing_blob = json.dumps(
      [
        {
          "id": v.get("id"),
          "title": v.get("title"),
          "summary": v.get("summary"),
          "sourceId": v.get("sourceId"),
          "policyId": v.get("policyId"),
          "severity": v.get("severity"),
          "details": v.get("details"),
        }
        for v in existing_open
      ],
      ensure_ascii=False,
    )

    system = (
      "You are a compliance monitoring agent. "
      "Given a document and a set of policies, extract potential compliance violations. "
      "Be practical and demo-friendly: err slightly toward catching real risks, but avoid hallucinating evidence. "
      "Return ONLY valid JSON matching the required schema."
    )

    schema = {
      "type": "object",
      "properties": {
        "violations": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {"type": "string"},
              "title": {"type": "string"},
              "summary": {"type": "string"},
              "sourceId": {"type": "string"},
              "policyId": {"type": "string"},
              "severity": {"type": "string", "enum": ["low", "medium", "high"]},
              "details": {
                "type": "object",
                "properties": {
                  "rule": {"type": "string"},
                  "evidence": {"type": "string"},
                  "location": {"type": "string"},
                  "recommendation": {"type": "string"},
                },
                "required": ["rule", "evidence", "location", "recommendation"],
              },
            },
            "required": ["id", "title", "summary", "sourceId", "policyId", "severity", "details"],
          },
        }
      },
      "required": ["violations"],
    }

    doc_has_retention_phrase = bool(re.search(RETENTION_REGEX, doc_text, re.I))
    doc_has_anyone_link = "anyone with the link" in doc_text.lower()
    doc_has_token = bool(re.search(r"sk_live_[A-Za-z0-9_\-]{10,}", doc_text))
    doc_has_email = bool(re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", doc_text, re.I))

    user = (
      f"DOCUMENT (sourceId=google-drive):\n{doc_text}\n\n"
      f"POLICIES:\n{policy_blob}\n\n"
      f"EXISTING_OPEN_VIOLATIONS_JSON:\n{existing_blob}\n\n"
      "TASK:\n"
      "- Identify OPEN violations present in the DOCUMENT content.\n"
      "- For each violation, choose the single best matching policyId from the provided policies.\n"
      "- Set sourceId to 'google-drive'.\n\n"
      "STABILITY:\n"
      "- If an existing open violation is still valid, include it again with the SAME id (do not change it).\n"
      "- Only output currently-open violations (do not output resolved ones).\n\n"
      "IMPORTANT DETECTION RULES (do not ignore):\n"
      "- If the DOCUMENT contains phrases that mean users cannot delete their data or data is kept forever/indefinitely, you MUST output a HIGH severity violation.\n"
      "- If the DOCUMENT contains an API token/secret (e.g. sk_live_), you MUST output a HIGH severity violation.\n"
      "- If the DOCUMENT is shared as 'Anyone with the link' and contains personal data (e.g. email), you MUST output a HIGH severity violation.\n\n"
      "FORCED TRIGGERS (based on server-side detection):\n"
      f"- retention_phrase_present={doc_has_retention_phrase}\n"
      f"- anyone_with_link_present={doc_has_anyone_link}\n"
      f"- token_present={doc_has_token}\n"
      f"- email_present={doc_has_email}\n\n"
      "If retention_phrase_present=true, include a violation with id 'retention-forever' unless an existing open violation already covers it.\n"
    )

    if os.getenv("LOG_LLM_PAYLOAD", "0") == "1":
      logger.info("========== LLM PAYLOAD BEGIN ==========")
      logger.info(
        "DOCUMENT chars=%d:\n%s", len(doc_text), _truncate(doc_text, MAX_LOG_CHARS)
      )
      logger.info(
        "POLICIES chars=%d:\n%s",
        len(policy_blob),
        _truncate(policy_blob, MAX_LOG_CHARS),
      )
      logger.info(
        "EXISTING_OPEN_VIOLATIONS_JSON chars=%d:\n%s",
        len(existing_blob),
        _truncate(existing_blob, MAX_LOG_CHARS),
      )
      logger.info("USER PROMPT chars=%d:\n%s", len(user), _truncate(user, MAX_LOG_CHARS))
      logger.info("========== LLM PAYLOAD END ==========")

    if os.getenv("LOG_LLM_AUDIT", "0") == "1":
      # Separate debug call: sentence-by-sentence audit to understand why the model thinks it's OK/NOT OK.
      audit_system = (
        "You are a compliance auditor. For each sentence from the document, say whether it violates any policy. "
        "If it violates, name the best matching policy id and explain briefly. "
        "If it does NOT violate, explain briefly why it is OK. "
        "Be concise and do not skip any sentences."
      )
      # Limit audit size to avoid runaway logs
      sentences = re.split(r"(?<=[.!?])\s+", doc_text)
      sentences = [s.strip() for s in sentences if s.strip()]
      max_sent = int(os.getenv("LOG_LLM_AUDIT_MAX_SENTENCES", "40"))
      audit_doc = "\n".join([f"{i+1}. {s}" for i, s in enumerate(sentences[:max_sent])])
      audit_user = (
        f"POLICY IDS AVAILABLE: {[p.get('id') for p in policies]}\n\n"
        f"POLICIES:\n{policy_blob}\n\n"
        f"DOCUMENT SENTENCES:\n{audit_doc}\n\n"
        "Output format:\n"
        "SENTENCE <n>: OK|VIOLATION (policyId=<id or n/a>) — <one sentence reason>\n"
      )
      logger.info("========== LLM AUDIT BEGIN ==========")
      try:
        audit_resp = client.chat.completions.create(
          model=model,
          messages=[
            {"role": "system", "content": audit_system},
            {"role": "user", "content": audit_user},
          ],
        )
        audit_text = audit_resp.choices[0].message.content or ""
        logger.info(_truncate(audit_text, MAX_LOG_CHARS))
      except Exception as e:  # noqa: BLE001
        logger.exception("LLM audit call failed: %s", e)
      logger.info("========== LLM AUDIT END ==========")

    try:
      resp = client.chat.completions.create(
        model=model,
        messages=[
          {"role": "system", "content": system},
          {"role": "user", "content": user},
        ],
        response_format={
          "type": "json_schema",
          "json_schema": {"name": "violations", "schema": schema},
        },
      )
    except Exception as e:  # noqa: BLE001
      logger.exception("LLM call error (model=%s): %s", model, e)
      raise

    content = resp.choices[0].message.content or "{}"
    if os.getenv("LOG_LLM_RESPONSE", "0") == "1":
      logger.info("========== LLM RESPONSE BEGIN ==========")
      logger.info(_truncate(content, MAX_LOG_CHARS))
      logger.info("========== LLM RESPONSE END ==========")
    try:
      parsed = json.loads(content)
    except Exception as e:  # noqa: BLE001
      logger.exception("Failed to parse LLM JSON response, returning 0 violations: %s", e)
      return []

    # Be defensive: some models may ignore json_schema and return unexpected shapes.
    raw_items: Any
    if isinstance(parsed, dict):
      raw_items = parsed.get("violations", [])
    elif isinstance(parsed, list):
      raw_items = parsed
    else:
      logger.warning("LLM response JSON has unexpected type=%s", type(parsed).__name__)
      raw_items = []

    if not isinstance(raw_items, list):
      logger.warning(
        "LLM response field 'violations' is not a list (type=%s); treating as empty.",
        type(raw_items).__name__,
      )
      raw_items = []

    out: List[Dict[str, Any]] = []
    for i, v in enumerate(raw_items):
      if isinstance(v, dict):
        out.append(v)
        continue
      # Sometimes the model returns strings; don't crash reconciliation.
      logger.warning(
        "LLM violation item %d has non-object type=%s; skipping.",
        i,
        type(v).__name__,
      )
    if len(out) == 0:
      # If we're getting empty responses, log some quick diagnostics.
      has_retention_phrase = bool(
        re.search(
          RETENTION_REGEX,
          doc_text,
          re.I,
        )
      )
      logger.warning(
        "LLM returned 0 violations diagnostics: doc_has_retention_phrase=%s policies=%s",
        has_retention_phrase,
        [p.get('id') for p in policies],
      )
      if os.getenv("LOG_LLM_EMPTY_RESPONSE", "1") == "1":
        logger.warning("LLM raw JSON (truncated):\n%s", _truncate(content, 2000))
    logger.info("LLM call complete: returned %d open violation(s).", len(out))
    return out

  def _reconcile(
    self, existing: List[Dict[str, Any]], detected_open: List[Dict[str, Any]]
  ) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Keep stable list:
    - new detected -> append (OPEN, firstSeen/lastSeen)
    - previously OPEN but not detected -> mark RESOLVED + resolvedAtIso
    - previously RESOLVED and detected again -> reopen
    """
    now = now_iso()

    existing_by_id: Dict[str, Dict[str, Any]] = {
      str(v.get("id")): v for v in existing if v.get("id") is not None
    }
    detected_by_id: Dict[str, Dict[str, Any]] = {
      str(v.get("id")): v for v in detected_open if v.get("id") is not None
    }

    changed = False
    new_count = 0
    reopened = 0
    resolved = 0

    # Start with existing list (preserve order), mutate in place
    updated: List[Dict[str, Any]] = []
    for old in existing:
      vid = old.get("id")
      if vid is None:
        continue
      vid = str(vid)
      status = old.get("status", "OPEN")

      if vid in detected_by_id:
        d = detected_by_id[vid]
        # Keep stable fields (id, firstSeen)
        if old.get("firstSeenIso") is None:
          old["firstSeenIso"] = old.get("createdAtIso") or now
        old["lastSeenIso"] = now

        # If it was resolved, reopen
        if status == "RESOLVED":
          old["status"] = "OPEN"
          old["resolvedAtIso"] = None
          reopened += 1
          changed = True

        # Update details if the model/heuristic improved wording
        for k in ["title", "summary", "sourceId", "policyId", "severity", "details"]:
          if d.get(k) is not None and d.get(k) != old.get(k):
            old[k] = d.get(k)
            changed = True

        updated.append(old)
      else:
        # Not detected this scan: resolve if it was open
        if status != "RESOLVED":
          old["status"] = "RESOLVED"
          old["resolvedAtIso"] = now
          changed = True
          resolved += 1
        updated.append(old)

    # Add newly detected items not in existing
    for vid, d in detected_by_id.items():
      if vid in existing_by_id:
        continue
      item = dict(d)
      item.setdefault("firstSeenIso", now)
      item.setdefault("lastSeenIso", now)
      item.setdefault("createdAtIso", now)
      item.setdefault("read", False)
      item["status"] = "OPEN"
      item["resolvedAtIso"] = None
      updated.insert(0, item)  # new items show up at top
      new_count += 1
      changed = True

    open_count = sum(1 for v in updated if v.get("status", "OPEN") == "OPEN")
    resolved_count = len(updated) - open_count

    return updated, {
      "changed": changed,
      "new": new_count,
      "reopened": reopened,
      "resolved": resolved,
      "open_count": open_count,
      "resolved_count": resolved_count,
    }

