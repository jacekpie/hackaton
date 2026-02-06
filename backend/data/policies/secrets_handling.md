# Secrets Handling — policy (mock)

## Key rules

1. **No secrets in source control**
   - API keys, tokens, passwords, private keys must never be committed.
2. **Rotate on exposure**
   - If a secret is found, rotate immediately and remove it from history.
3. **Use scanning**
   - Enable secret scanning and block PRs containing secrets.

