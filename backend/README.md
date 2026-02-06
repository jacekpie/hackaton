## Backend (Flask) — dont get fined Ai

### Setup

From repo root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp example.env .env  # put your OPENAI_API_KEY here
python app.py
```

Backend runs on **`http://127.0.0.1:5005`**.

### What it does (currently)

- Polls local “Google Drive” document every **10 seconds**: `backend/data/sources/google_drive/user_journey.txt`
- Loads policies from: `backend/data/policies/`
- Calls OpenAI (if `OPENAI_API_KEY` is set) to extract policy violations as JSON
- If no key is set, falls back to a simple heuristic detector (emails/phones/access keywords) so the UI still shows data

### Endpoints

- `GET /health`
- `GET /api/status`
- `GET /api/sources`
- `GET /api/policies`
- `GET /api/violations`
- `POST /api/scan` (trigger immediate scan)
- `POST /api/policies` (mock upload: JSON body)
- `DELETE /api/policies/<policy_id>` (mock delete)

