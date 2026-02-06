export type SourceId = "google-drive" | "github" | "slack";

export type PolicyId =
  | "gdpr"
  | "secrets-handling"
  | "data-retention"
  | "access-control"
  | "acceptable-use-comms";

export type Severity = "low" | "medium" | "high";

export type Source = {
  id: SourceId;
  name: string;
  description: string;
};

export type Policy = {
  id: PolicyId | string;
  name: string;
  description: string;
  version: string;
  updatedAtIso: string;
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
  policyId: PolicyId | string;
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

export const mockPolicies: Policy[] = [
  {
    id: "gdpr",
    name: "GDPR",
    description: "General Data Protection Regulation baseline controls",
    version: "1.0",
    updatedAtIso: "2026-02-01T10:00:00.000Z",
  },
  {
    id: "secrets-handling",
    name: "Secrets Handling",
    description: "Rules for credentials, tokens, and secret scanning",
    version: "1.2",
    updatedAtIso: "2026-01-18T15:30:00.000Z",
  },
  {
    id: "access-control",
    name: "Access Control",
    description: "Sharing, least privilege, and external access restrictions",
    version: "2.0",
    updatedAtIso: "2026-01-28T09:00:00.000Z",
  },
  {
    id: "data-retention",
    name: "Data Retention",
    description: "Retention periods and deletion requirements by data class",
    version: "1.1",
    updatedAtIso: "2026-01-25T12:00:00.000Z",
  },
  {
    id: "acceptable-use-comms",
    name: "Acceptable Use (Comms)",
    description: "Guidelines for sharing sensitive info in chat and tickets",
    version: "1.0",
    updatedAtIso: "2026-01-10T08:00:00.000Z",
  },
];

export const mockViolations: Violation[] = [
  {
    id: "v-001",
    title: "Possible personal data in shared spreadsheet",
    summary:
      "A shared Sheet appears to contain emails and phone numbers in a public link.",
    sourceId: "google-drive",
    policyId: "access-control",
    severity: "high",
    createdAtIso: "2026-02-06T09:12:00.000Z",
    read: false,
    details: {
      rule: "Access Control: personal data shared externally without access control",
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
    policyId: "secrets-handling",
    severity: "high",
    createdAtIso: "2026-02-06T08:47:00.000Z",
    read: false,
    details: {
      rule: "Secrets Handling: credentials must not be stored in source control",
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
    policyId: "acceptable-use-comms",
    severity: "medium",
    createdAtIso: "2026-02-05T18:20:00.000Z",
    read: false,
    details: {
      rule: "Acceptable Use (Comms): avoid sharing personal data in broad channels",
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
    policyId: "data-retention",
    severity: "low",
    createdAtIso: "2026-02-03T11:05:00.000Z",
    read: true,
    details: {
      rule: "Data Retention: documentation must reflect actual retention practices",
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
    policyId: "gdpr",
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

