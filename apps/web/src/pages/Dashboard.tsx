import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, CircleDashed, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { formatDaysRemaining, formatRange } from "@/lib/format";
import type { ProgressRow } from "@/lib/types";

const statusMap: Record<ProgressRow["status"], { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  overdue: { label: "Overdue", variant: "danger" },
  complete: { label: "Complete", variant: "success" },
  at_risk: { label: "At risk", variant: "warning" },
  on_track: { label: "On track", variant: "default" },
};

export default function Dashboard() {
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["progress"],
    queryFn: api.getProgress,
  });

  const showWelcome = !isLoading && (isError || data.length === 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your cycle thermometers and alerts at a glance."
      />

      {isLoading && <div className="text-sm text-ink/70">Loading progress...</div>}
      {showWelcome && (
        <Card className="relative overflow-hidden border-stroke/70">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsla(30,95%,56%,0.2),transparent_50%),radial-gradient(circle_at_bottom_left,hsla(198,85%,50%,0.16),transparent_45%)]" />
          <CardHeader className="relative space-y-4 pb-0">
            <Badge variant="secondary" className="w-fit bg-surface/90 text-ink">
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              Welcome to CEU Planner
            </Badge>
            <div>
              <CardTitle className="text-2xl">Set up your CE tracking in 2 minutes</CardTitle>
              <p className="mt-2 max-w-2xl text-sm text-ink/70">
                Add your first state license, create its current renewal cycle, then log courses and certificates.
              </p>
            </div>
            {isError && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                <AlertTriangle className="h-4 w-4" />
                Progress data could not be loaded yet.
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Retry
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="relative mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-stroke/60 bg-surface/85 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <CheckCircle2 className="h-4 w-4 text-accent2" />
                  1. Add state license
                </div>
                <p className="text-xs text-ink/70">Start with your active state and license number.</p>
              </div>
              <div className="rounded-lg border border-stroke/60 bg-surface/85 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <CircleDashed className="h-4 w-4 text-accent2" />
                  2. Add renewal cycle
                </div>
                <p className="text-xs text-ink/70">Define cycle dates and required hours.</p>
              </div>
              <div className="rounded-lg border border-stroke/60 bg-surface/85 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                  <CheckCircle2 className="h-4 w-4 text-accent2" />
                  3. Log courses
                </div>
                <p className="text-xs text-ink/70">Upload certificates and apply hours.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to="/licenses">
                  Get started
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/courses">Add a course</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/timeline">View timeline</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {data.map((row) => {
          const status = statusMap[row.status];
          const percentValue = Math.round(Number(row.percent) * 100);
          return (
            <Card key={row.cycle_id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{row.state_code}</CardTitle>
                    <p className="text-sm text-ink/70">{formatRange(row.cycle_start, row.cycle_end)}</p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Progress value={percentValue} />
                <div className="flex flex-wrap items-center justify-between text-sm text-ink/80">
                  <span>{row.earned_hours} / {row.required_hours} hours</span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-4 w-4" />
                    {formatDaysRemaining(row.days_remaining)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-ink/60">
                  <span>Remaining: {row.remaining_hours} hours</span>
                  {row.warnings.length > 0 && (
                    <span className="flex items-center gap-1 text-warning">
                      <AlertTriangle className="h-4 w-4" />
                      Course applied to multiple cycles
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
