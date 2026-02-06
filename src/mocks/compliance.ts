export type SourceId = "google-drive" | "github" | "slack";

export type Severity = "low" | "medium" | "high";

export type Source = {
  id: SourceId;
  name: string;
  description: string;
};

export type Violation = {
  id: string;
  title: string;
  summary: string;
  details: {
    rule: string;
    evidence: string;
    location: string;
    recommendation: string;
  };
  sourceId: SourceId;
  severity: Severity;
  createdAtIso: string;
  read: boolean;
};

export const mockSources: Source[] = [
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Docs, Sheets, Slides",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Code, PRs, issues",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Messages, threads",
  },
];

export const mockViolations: Violation[] = [
  {
    id: "v-001",
    title: "Possible personal data in shared spreadsheet",
    summary:
      "A shared Sheet appears to contain emails and phone numbers in a public link.",
    sourceId: "google-drive",
    severity: "high",
    createdAtIso: "2026-02-06T09:12:00.000Z",
    read: false,
    details: {
      rule: "GDPR: personal data shared externally without access control",
      evidence:
        "Detected columns: email, phone. Sharing: “Anyone with the link”.",
      location: "Drive → “Customer Imports Q1” (Sheet) → tab “raw_upload”",
      recommendation:
        "Restrict link sharing, remove personal data, and use access-limited folder.",
    },
  },
  {
    id: "v-002",
    title: "Token-like secret committed in repository",
    summary:
      "A string matching an API token pattern was found in a recent commit.",
    sourceId: "github",
    severity: "high",
    createdAtIso: "2026-02-06T08:47:00.000Z",
    read: false,
    details: {
      rule: "Security/GDPR: credentials must not be stored in source control",
      evidence: "Matched pattern: `sk_live_********` in `config.ts`.",
      location: "GitHub → repo “platform” → commit `a1b2c3d`",
      recommendation:
        "Rotate the credential, remove it from git history, add secret scanning.",
    },
  },
  {
    id: "v-003",
    title: "Customer data discussed in public channel",
    summary:
      "A message references a customer’s full name and email in a broad channel.",
    sourceId: "slack",
    severity: "medium",
    createdAtIso: "2026-02-05T18:20:00.000Z",
    read: false,
    details: {
      rule: "GDPR: limit personal data exposure to least-privilege audiences",
      evidence:
        "Mentions: “John Doe”, “john.doe@…”. Channel has 140+ members.",
      location: "Slack → #general → thread “Onboarding issue”",
      recommendation:
        "Move discussion to restricted channel and redact personal data.",
    },
  },
  {
    id: "v-004",
    title: "Outdated data retention statement",
    summary:
      "A policy doc references a retention period inconsistent with latest requirements.",
    sourceId: "google-drive",
    severity: "low",
    createdAtIso: "2026-02-03T11:05:00.000Z",
    read: true,
    details: {
      rule: "GDPR: retention documentation must reflect actual retention practices",
      evidence: "Doc states “retain for 5 years” while current policy is 2 years.",
      location: "Drive → “Privacy Policy - Draft” (Doc)",
      recommendation:
        "Update the retention section and link the latest approved policy source.",
    },
  },
  {
    id: "v-005",
    title: "PR description includes sample personal data",
    summary:
      "A pull request contains sample payloads with realistic names and emails.",
    sourceId: "github",
    severity: "medium",
    createdAtIso: "2026-01-30T14:42:00.000Z",
    read: true,
    details: {
      rule: "GDPR: avoid storing personal data in tooling artifacts where possible",
      evidence: "Payload includes `name`, `email`, `address`.",
      location: "GitHub → repo “api” → PR #128",
      recommendation:
        "Replace with synthetic placeholders and document anonymization guidelines.",
    },
  },
];

