import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { cn } from "./lib/utils";
import {
  mockSources,
  mockViolations,
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
  const [selectedSourceId, setSelectedSourceId] = useState<SourceId | "all">(
    "all",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [violations, setViolations] = useState<Violation[]>(mockViolations);

  const visibleViolations = useMemo(() => {
    if (selectedSourceId === "all") return violations;
    return violations.filter((v) => v.sourceId === selectedSourceId);
  }, [selectedSourceId, violations]);

  const unread = visibleViolations.filter((v) => !v.read);
  const read = visibleViolations.filter((v) => v.read);

  const unreadTotal = violations.filter((v) => !v.read).length;
  const readTotal = violations.length - unreadTotal;

  function toggleExpanded(v: Violation) {
    setExpandedId((prev) => (prev === v.id ? null : v.id));
    if (!v.read) {
      setViolations((prev) =>
        prev.map((x) => (x.id === v.id ? { ...x, read: true } : x)),
      );
    }
  }

  function markAllRead() {
    setViolations((prev) => prev.map((v) => ({ ...v, read: true })));
  }

  function toggleRead(id: string) {
    setViolations((prev) =>
      prev.map((v) => (v.id === id ? { ...v, read: !v.read } : v)),
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-6xl">
        {/* Left sidebar (~20%) */}
        <aside className="w-1/5 min-w-[240px] border-r border-border bg-sidebar text-sidebar-foreground">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-muted-foreground">
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
                    )}
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

        {/* Main column (~80%) */}
        <main className="w-4/5 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                GDPR monitoring (mock)
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Policy violations
              </h1>
              <div className="mt-1 text-sm text-muted-foreground">
                Click a violation to expand details. Opening marks it as{" "}
                <span className="font-medium text-foreground">read</span>.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="destructive">Unread: {unread.length}</Badge>
              <Badge variant="secondary">Read: {read.length}</Badge>
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {/* Unread */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Unread</h2>
                <div className="text-xs text-muted-foreground">
                  {unread.length} item(s)
                </div>
              </div>
              <div className="space-y-3">
                {unread.length === 0 ? (
                  <Card className="p-4">
                    <div className="flex items-center gap-2 text-sm">
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
                    />
                  ))
                )}
              </div>
            </section>

            {/* Read */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Read
                </h2>
                <div className="text-xs text-muted-foreground">
                  {read.length} item(s)
                </div>
              </div>
              <div className="space-y-3">
                {read.length === 0 ? (
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground">
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
                    />
                  ))
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function ViolationCard({
  v,
  expanded,
  onToggle,
  onToggleRead,
}: {
  v: Violation;
  expanded: boolean;
  onToggle: () => void;
  onToggleRead: () => void;
}) {
  const sourceName =
    mockSources.find((s) => s.id === v.sourceId)?.name ?? v.sourceId;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left"
      aria-expanded={expanded}
    >
      <Card
        className={cn(
          "p-4 transition-colors hover:bg-secondary/40",
          !v.read && "border-l-4 border-l-destructive",
          v.read && "opacity-90",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-base font-semibold">{v.title}</div>
              {!v.read ? (
                <Badge variant="destructive">Unread</Badge>
              ) : (
                <Badge variant="secondary">Read</Badge>
              )}
              <Badge variant={severityVariant(v.severity)}>
                {v.severity.toUpperCase()}
              </Badge>
            </div>

            <div className="mt-1 text-sm text-muted-foreground">
              {v.summary}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Source:</span>{" "}
                {sourceName}
              </div>
              <div>
                <span className="font-medium text-foreground">When:</span>{" "}
                {formatWhen(v.createdAtIso)}
              </div>
            </div>

            {expanded ? (
              <div className="mt-4 rounded-lg border border-border bg-card p-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <DetailItem label="Rule" value={v.details.rule} />
                  <DetailItem label="Location" value={v.details.location} />
                  <DetailItem label="Evidence" value={v.details.evidence} />
                  <DetailItem
                    label="Recommendation"
                    value={v.details.recommendation}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    Click again to collapse.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleRead();
                    }}
                  >
                    {v.read ? "Mark as unread" : "Mark as read"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <ChevronDown
            className={cn(
              "mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>
      </Card>
    </button>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

