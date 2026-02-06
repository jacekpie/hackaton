import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileUp,
  Trash2,
  Moon,
  Sun,
} from "lucide-react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Switch } from "./components/ui/switch";
import { cn } from "./lib/utils";
import {
  mockSources,
  mockPolicies,
  mockViolations,
  type Policy,
  type SourceId,
  type Violation,
} from "./mocks/compliance";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityVariant(severity: Violation["severity"]) {
  switch (severity) {
    case "high":
      return "destructive";
    case "medium":
      return "secondary";
    case "low":
      return "outline";
    default:
      return "secondary";
  }
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | "all">(
    "all",
  );
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | "all">(
    "all",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [violations, setViolations] = useState<Violation[]>(mockViolations);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [policies, setPolicies] = useState<Policy[]>(mockPolicies);
  const [activeSourceId, setActiveSourceId] = useState<SourceId | null>(null);
  const [activePolicyId, setActivePolicyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.classList.toggle("dark", saved === "dark");
      return;
    }

    const prefersDark = window.matchMedia?.(
      "(prefers-color-scheme: dark)",
    )?.matches;
    const initial: "light" | "dark" = prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  function setThemeAndPersist(next: "light" | "dark") {
    setTheme(next);
    window.localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  useEffect(() => {
    // Avoid “hidden selection” when switching sources/policies
    setSelectedIds(new Set());
  }, [selectedSourceId, selectedPolicyId]);

  const visibleViolations = useMemo(() => {
    return violations.filter((v) => {
      const okSource = selectedSourceId === "all" || v.sourceId === selectedSourceId;
      const okPolicy = selectedPolicyId === "all" || v.policyId === selectedPolicyId;
      return okSource && okPolicy;
    });
  }, [selectedSourceId, selectedPolicyId, violations]);

  const unread = visibleViolations.filter((v) => !v.read);
  const read = visibleViolations.filter((v) => v.read);

  const unreadTotal = violations.filter((v) => !v.read).length;
  const readTotal = violations.length - unreadTotal;

  function toggleExpanded(v: Violation) {
    const nextExpanded = expandedId === v.id ? null : v.id;
    setExpandedId(nextExpanded);
    if (nextExpanded) {
      setActiveSourceId(v.sourceId);
      setActivePolicyId(v.policyId);
      setSelectedPolicyId(v.policyId);
    } else {
      setActiveSourceId(null);
      setActivePolicyId(null);
    }
    if (!v.read) {
      setViolations((prev) =>
        prev.map((x) => (x.id === v.id ? { ...x, read: true } : x)),
      );
    }
  }

  function markAllRead() {
    setViolations((prev) => prev.map((v) => ({ ...v, read: true })));
  }

  function markAllUnread() {
    setViolations((prev) => prev.map((v) => ({ ...v, read: false })));
  }

  function markSelectedUnread() {
    if (selectedIds.size === 0) return;
    setViolations((prev) =>
      prev.map((v) => (selectedIds.has(v.id) ? { ...v, read: false } : v)),
    );
    setSelectedIds(new Set());
  }

  function toggleRead(id: string) {
    setViolations((prev) =>
      prev.map((v) => (v.id === id ? { ...v, read: !v.read } : v)),
    );
  }

  function toggleSelected(id: string, next: boolean) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(visibleViolations.map((v) => v.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleUploadPolicy(file: File | null) {
    if (!file) return;
    const text = await file.text().catch(() => "");
    const now = new Date();
    const id = `policy-${now.getTime()}`;
    setPolicies((prev) => [
      {
        id,
        name: file.name.replace(/\.[^/.]+$/, ""),
        description: text ? "Uploaded policy (text extracted)" : "Uploaded policy",
        version: "1.0",
        updatedAtIso: now.toISOString(),
      },
      ...prev,
    ]);
    setSelectedPolicyId(id);
    setActivePolicyId(id);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function deleteSelectedPolicy() {
    if (selectedPolicyId === "all") return;
    setPolicies((prev) => prev.filter((p) => p.id !== selectedPolicyId));
    if (activePolicyId === selectedPolicyId) setActivePolicyId(null);
    setSelectedPolicyId("all");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex w-full items-center justify-between px-6 py-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-muted-foreground">
              Continuous Compliance Monitoring
            </div>
            <div className="truncate text-base font-semibold">Dashboard</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sun className="h-4 w-4" />
              <Switch
                checked={theme === "dark"}
                onCheckedChange={(checked) =>
                  setThemeAndPersist(checked ? "dark" : "light")
                }
                aria-label="Toggle dark mode"
              />
              <Moon className="h-4 w-4" />
            </div>
          </div>
        </div>
      </header>

      <div className="flex w-full flex-1 min-h-0">
        {/* Left sidebar (~20%) */}
        <aside className="w-1/5 min-w-[240px] border-r border-border bg-sidebar text-sidebar-foreground">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">
                  Continuous compliance
                </div>
                <div className="text-base font-semibold">Sources</div>
              </div>
              <Badge variant={unreadTotal > 0 ? "destructive" : "secondary"}>
                {unreadTotal} unread
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setSelectedSourceId("all")}
                className={cn(
                  "w-full rounded-lg border border-border px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-sidebar-accent",
                  selectedSourceId === "all" &&
                    "border-sidebar-ring bg-sidebar-accent",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">All sources</div>
                  <div className="text-xs text-muted-foreground">
                    {violations.length}
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Unread: {unreadTotal} • Read: {readTotal}
                </div>
              </button>

              {mockSources.map((s) => {
                const count = violations.filter((v) => v.sourceId === s.id)
                  .length;
                const unreadCount = violations.filter(
                  (v) => v.sourceId === s.id && !v.read,
                ).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSourceId(s.id)}
                    className={cn(
                      "w-full rounded-lg border border-border px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-sidebar-accent",
                      selectedSourceId === s.id &&
                        "border-sidebar-ring bg-sidebar-accent",
                      activeSourceId === s.id &&
                        "ring-2 ring-sidebar-ring",
                    )}
                    aria-current={activeSourceId === s.id ? "true" : undefined}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {s.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 ? (
                          <Badge variant="destructive">{unreadCount}</Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                        <div className="text-xs text-muted-foreground">
                          / {count}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={markAllRead}
                disabled={unreadTotal === 0}
              >
                Mark all as read
              </Button>
            </div>
          </div>
        </aside>

        {/* Main column */}
        <main className="flex-1 min-w-0 p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-muted-foreground">
                GDPR monitoring (mock)
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Policy violations
              </h1>
              <div className="mt-1 text-base text-muted-foreground">
                Click a violation to expand details. Opening marks it as{" "}
                <span className="font-medium text-foreground">read</span>.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="destructive">Unread: {unread.length}</Badge>
              <Badge variant="secondary">Read: {read.length}</Badge>
            </div>
          </div>

          {/* Bulk actions */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
            <div className="text-sm text-muted-foreground">
              Selected:{" "}
              <span className="font-semibold text-foreground">
                {selectedIds.size}
              </span>
              {visibleViolations.length > 0 ? (
                <span className="text-muted-foreground">
                  {" "}
                  / {visibleViolations.length} visible
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={selectAllVisible}
                disabled={visibleViolations.length === 0}
              >
                Select all visible
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
              >
                Clear selection
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={markSelectedUnread}
                disabled={selectedIds.size === 0}
              >
                Mark selected as unread
              </Button>
              <Button variant="outline" size="sm" onClick={markAllUnread}>
                Mark all as unread
              </Button>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {/* Unread */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold">Unread</h2>
                <div className="text-sm text-muted-foreground">
                  {unread.length} item(s)
                </div>
              </div>
              <div className="space-y-3">
                {unread.length === 0 ? (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-base">
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                      No unread violations.
                    </div>
                  </Card>
                ) : (
                  unread.map((v) => (
                    <ViolationCard
                      key={v.id}
                      v={v}
                      expanded={expandedId === v.id}
                      onToggle={() => toggleExpanded(v)}
                      onToggleRead={() => toggleRead(v.id)}
                      selected={selectedIds.has(v.id)}
                      onSelectedChange={(next) => toggleSelected(v.id, next)}
                    />
                  ))
                )}
              </div>
            </section>

            {/* Read */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-base font-semibold text-muted-foreground">
                  Read
                </h2>
                <div className="text-sm text-muted-foreground">
                  {read.length} item(s)
                </div>
              </div>
              <div className="space-y-3">
                {read.length === 0 ? (
                  <Card className="p-4">
                    <div className="text-base text-muted-foreground">
                      Nothing read yet.
                    </div>
                  </Card>
                ) : (
                  read.map((v) => (
                    <ViolationCard
                      key={v.id}
                      v={v}
                      expanded={expandedId === v.id}
                      onToggle={() => toggleExpanded(v)}
                      onToggleRead={() => toggleRead(v.id)}
                      selected={selectedIds.has(v.id)}
                      onSelectedChange={(next) => toggleSelected(v.id, next)}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        </main>

        {/* Right sidebar: policies */}
        <aside className="w-1/5 min-w-[260px] border-l border-border bg-sidebar text-sidebar-foreground">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-muted-foreground">
                  Compliance set
                </div>
                <div className="text-base font-semibold">Policies</div>
              </div>
              <Badge variant="secondary">{policies.length}</Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.json"
                onChange={(e) => void handleUploadPolicy(e.target.files?.[0] ?? null)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                Upload
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={deleteSelectedPolicy}
                disabled={selectedPolicyId === "all"}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => setSelectedPolicyId("all")}
                className={cn(
                  "w-full rounded-lg border border-border px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-sidebar-accent",
                  selectedPolicyId === "all" &&
                    "border-sidebar-ring bg-sidebar-accent",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">All policies</div>
                  <div className="text-xs text-muted-foreground">
                    {violations.length}
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Filter violations by policy
                </div>
              </button>

              {policies.map((p) => {
                const isActive = activePolicyId === p.id;
                const isSelected = selectedPolicyId === p.id;
                const count = violations.filter((v) => v.policyId === p.id).length;
                const unreadCount = violations.filter(
                  (v) => v.policyId === p.id && !v.read,
                ).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPolicyId(p.id)}
                    className={cn(
                      "w-full rounded-lg border border-border px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-sidebar-accent",
                      isSelected && "border-sidebar-ring bg-sidebar-accent",
                      isActive && "ring-2 ring-sidebar-ring",
                    )}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {p.description}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          v{p.version} • updated {formatWhen(p.updatedAtIso)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 ? (
                          <Badge variant="destructive">{unreadCount}</Badge>
                        ) : (
                          <Badge variant="secondary">0</Badge>
                        )}
                        <div className="text-xs text-muted-foreground">
                          / {count}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ViolationCard({
  v,
  expanded,
  onToggle,
  onToggleRead,
  selected,
  onSelectedChange,
}: {
  v: Violation;
  expanded: boolean;
  onToggle: () => void;
  onToggleRead: () => void;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
}) {
  const sourceName =
    mockSources.find((s) => s.id === v.sourceId)?.name ?? v.sourceId;
  const detailsId = `violation-details-${v.id}`;
  const checkboxId = `violation-select-${v.id}`;

  return (
    <Card
      className={cn(
        "p-4 transition-colors hover:bg-secondary/40",
        !v.read && "border-l-4 border-l-destructive",
        v.read && "opacity-95",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="pt-1">
          <input
            id={checkboxId}
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelectedChange(e.target.checked)}
            className="h-4 w-4 rounded-sm border border-border bg-background accent-[color:var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label={`Select violation: ${v.title}`}
          />
        </div>

        <div
          className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
          aria-hidden="true"
        >
          <AlertTriangle className="h-5 w-5" />
        </div>

        <details
          className="min-w-0 flex-1"
          open={expanded}
          onToggle={(e) => {
            const isOpen = (e.currentTarget as HTMLDetailsElement).open;
            if (isOpen !== expanded) onToggle();
          }}
        >
          <summary
            className={cn(
              "block list-none cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
            )}
            aria-controls={detailsId}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-lg font-semibold">{v.title}</div>
                  {!v.read ? (
                    <Badge variant="destructive">Unread</Badge>
                  ) : (
                    <Badge variant="secondary">Read</Badge>
                  )}
                  <Badge variant={severityVariant(v.severity)}>
                    {v.severity.toUpperCase()}
                  </Badge>
                </div>

                <div className="mt-1 text-base text-muted-foreground">
                  {v.summary}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Source:</span>{" "}
                    {sourceName}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">When:</span>{" "}
                    {formatWhen(v.createdAtIso)}
                  </div>
                </div>
              </div>

              <ChevronDown
                className={cn(
                  "mt-2 h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                  expanded && "rotate-180",
                )}
                aria-hidden="true"
              />
            </div>
          </summary>

          <div
            id={detailsId}
            className="mt-4 rounded-lg border border-border bg-card p-3"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <DetailItem label="Rule" value={v.details.rule} />
              <DetailItem label="Location" value={v.details.location} />
              <DetailItem label="Evidence" value={v.details.evidence} />
              <DetailItem label="Recommendation" value={v.details.recommendation} />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground">
                Toggle read/unread without changing selection.
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onToggleRead}>
                {v.read ? "Mark as unread" : "Mark as read"}
              </Button>
            </div>
          </div>
        </details>
      </div>
    </Card>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-base">{value}</div>
    </div>
  );
}

