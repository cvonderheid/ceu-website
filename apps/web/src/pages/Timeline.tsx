import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { formatRange } from "@/lib/format";

export default function Timeline() {
  const { data, isLoading } = useQuery({
    queryKey: ["progress"],
    queryFn: api.getProgress,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, typeof data>();
    data?.forEach((row) => {
      if (!map.has(row.state_code)) {
        map.set(row.state_code, []);
      }
      map.get(row.state_code)?.push(row);
    });
    return Array.from(map.entries());
  }, [data]);

  return (
    <div>
      <PageHeader title="Timeline" subtitle="Grouped by state for quick scanning." />

      {isLoading && <div className="text-sm text-ink/70">Loading timeline...</div>}
      {!isLoading && (!data || data.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>No cycles yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink/70">Add a state license to build your timeline.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {grouped.map(([stateCode, rows]) => (
          <div key={stateCode} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{stateCode}</Badge>
              <span className="text-sm text-ink/70">{rows?.length ?? 0} cycles</span>
            </div>
            <div className="space-y-3">
              {rows?.map((row) => (
                <Card key={row.cycle_id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{formatRange(row.cycle_start, row.cycle_end)}</CardTitle>
                      <span className="text-xs text-ink/60">{row.status.replace("_", " ")}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Progress value={Math.round(Number(row.percent) * 100)} />
                    <div className="flex items-center justify-between text-sm text-ink/80">
                      <span>{row.earned_hours} / {row.required_hours} hours</span>
                      <span>{row.days_remaining} days left</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
