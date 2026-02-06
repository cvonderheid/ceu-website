import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock } from "lucide-react";
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["progress"],
    queryFn: api.getProgress,
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your cycle thermometers and alerts at a glance."
      />

      {isLoading && <div className="text-sm text-ink/70">Loading progress...</div>}
      {error && <div className="text-sm text-danger">Failed to load progress.</div>}

      {!isLoading && data?.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No cycles yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink/70">Create a state license and cycle to see progress.</p>
            <Button asChild className="mt-3">
              <Link to="/licenses">Add your first state</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {data?.map((row) => {
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
