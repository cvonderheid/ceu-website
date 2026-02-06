import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, parseISO, subMonths } from "date-fns";
import { AlertTriangle, Dot } from "lucide-react";
import { Link } from "react-router-dom";

import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { formatDate, formatDaysRemaining, formatHours, formatRange } from "@/lib/format";
import type { TimelineCourse, TimelineCycle, TimelineEvent } from "@/lib/types";


const COURSE_EVENT_KINDS: TimelineEvent["kind"][] = [
  "course_completed",
  "certificate_uploaded",
];
const CYCLE_EVENT_KINDS: TimelineEvent["kind"][] = [
  "cycle_started",
  "cycle_due_soon",
  "cycle_overdue",
  "cycle_completed",
];

const EVENT_KIND_LABELS: Record<TimelineEvent["kind"], string> = {
  course_completed: "Course completed",
  certificate_uploaded: "Certificate uploaded",
  cycle_started: "Cycle started",
  cycle_due_soon: "Cycle due soon",
  cycle_overdue: "Cycle overdue",
  cycle_completed: "Cycle completed",
};

type EventCourseMeta = {
  id: string;
  title: string;
  provider?: string | null;
  completed_at: string;
  hours: string;
  has_certificate?: boolean;
};

type EventCertificateMeta = {
  id: string;
  filename: string;
  created_at: string;
};

type EventAllocationMeta = {
  cycle_id: string;
  state_code: string;
  cycle_start: string;
  cycle_end: string;
};

type EventCycleMeta = {
  id: string;
  state_code: string;
  cycle_start: string;
  cycle_end: string;
  required_hours: string;
  earned_hours: string;
  remaining_hours: string;
  percent: string;
  status: string;
  days_remaining: number;
};

type EventMeta = {
  course?: EventCourseMeta;
  certificates?: EventCertificateMeta[];
  allocations?: EventAllocationMeta[];
  cycle?: EventCycleMeta;
  courses?: EventCourseMeta[];
  warnings?: Array<{ course_title?: string }>;
};

function eventKindLabel(kind: TimelineEvent["kind"]) {
  return EVENT_KIND_LABELS[kind];
}

function eventSubtitle(event: TimelineEvent) {
  const meta = event.meta as EventMeta | undefined;
  if (
    CYCLE_EVENT_KINDS.includes(event.kind) &&
    meta?.cycle?.cycle_start &&
    meta?.cycle?.cycle_end
  ) {
    return formatRange(meta.cycle.cycle_start, meta.cycle.cycle_end);
  }
  return event.subtitle ?? undefined;
}

function statusVariant(status: TimelineCycle["status"]) {
  switch (status) {
    case "complete":
      return "success";
    case "overdue":
      return "danger";
    case "at_risk":
      return "warning";
    default:
      return "secondary";
  }
}

function statusLabel(status: TimelineCycle["status"]) {
  switch (status) {
    case "complete":
      return "Complete";
    case "overdue":
      return "Overdue";
    case "at_risk":
      return "At risk";
    default:
      return "On track";
  }
}

function badgeVariant(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("overdue")) {
    return "danger";
  }
  if (normalized.includes("complete")) {
    return "success";
  }
  if (normalized.includes("risk") || normalized.includes("due") || normalized.includes("warning")) {
    return "warning";
  }
  return "secondary";
}

function getRangeBounds(range: string) {
  const today = new Date();
  if (range === "6m") {
    return { from: subMonths(today, 6), to: addMonths(today, 1) };
  }
  if (range === "12m") {
    return { from: subMonths(today, 12), to: addMonths(today, 2) };
  }
  if (range === "24m") {
    return { from: subMonths(today, 24), to: addMonths(today, 3) };
  }
  return null;
}

function getFetchParams(range: string) {
  const bounds = getRangeBounds(range);
  if (!bounds) {
    return undefined;
  }
  return {
    from: format(bounds.from, "yyyy-MM-dd"),
    to: format(bounds.to, "yyyy-MM-dd"),
  };
}

export default function Timeline() {
  const [feedRange, setFeedRange] = useState("12m");
  const [feedTab, setFeedTab] = useState("all");
  const [feedState, setFeedState] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const [desktopRange, setDesktopRange] = useState("12m");
  const [desktopView, setDesktopView] = useState("full");
  const [selectedCycle, setSelectedCycle] = useState<TimelineCycle | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<TimelineCourse | null>(null);

  const desktopParams = useMemo(() => getFetchParams(desktopRange), [desktopRange]);
  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ["timeline", desktopRange],
    queryFn: () => api.getTimeline(desktopParams),
  });

  const eventParams = useMemo(() => {
    const base = getFetchParams(feedRange);
    return {
      from: base?.from,
      to: base?.to,
      state: feedState !== "all" ? feedState : undefined,
    };
  }, [feedRange, feedState]);

  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ["timeline-events", feedRange, feedState],
    queryFn: () => api.getTimelineEvents(eventParams),
  });

  const states = timelineData?.states ?? [];
  const stateOptions = useMemo(
    () => Array.from(new Set(states.map((state) => state.state_code))).sort(),
    [states]
  );

  const filteredEvents = useMemo(() => {
    const items = eventsData ?? [];
    if (feedTab === "courses") {
      return items.filter((event) => COURSE_EVENT_KINDS.includes(event.kind));
    }
    if (feedTab === "cycles") {
      return items.filter((event) => CYCLE_EVENT_KINDS.includes(event.kind));
    }
    return items;
  }, [eventsData, feedTab]);

  const groupedEvents = useMemo(() => {
    const sorted = [...filteredEvents].sort(
      (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    );
    const map = new Map<string, TimelineEvent[]>();
    sorted.forEach((event) => {
      const label = format(parseISO(event.occurred_at), "MMM yyyy");
      if (!map.has(label)) {
        map.set(label, []);
      }
      map.get(label)?.push(event);
    });
    return Array.from(map.entries());
  }, [filteredEvents]);

  const selectedMeta = selectedEvent?.meta as EventMeta | undefined;
  const isCourseEvent = selectedEvent ? COURSE_EVENT_KINDS.includes(selectedEvent.kind) : false;
  const isCycleEvent = selectedEvent ? CYCLE_EVENT_KINDS.includes(selectedEvent.kind) : false;

  const renderDesktopStates = (showCourses: boolean) => (
    <>
      {timelineLoading && (
        <div className="space-y-4">
          {[0, 1].map((item) => (
            <Card key={item}>
              <CardHeader className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!timelineLoading && states.length === 0 && (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold">No cycles yet</div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink/70">Add a license to build your timeline.</p>
          </CardContent>
        </Card>
      )}

      {!timelineLoading && states.length > 0 && (
        <div className="space-y-6">
          {states.map((state) => (
            <Card key={state.state_code}>
              <CardHeader className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{state.state_code}</Badge>
                <span className="text-sm text-ink/60">{state.cycles.length} cycles</span>
                {state.license_number && <Badge variant="default">#{state.license_number}</Badge>}
              </CardHeader>
              <CardContent className="space-y-4">
                {state.cycles.map((cycle) => {
                  const progress = Math.round(Number(cycle.percent) * 100);
                  return (
                    <div
                      key={cycle.id}
                      className="space-y-3 rounded-xl border border-stroke/60 bg-surface/80 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            {formatRange(cycle.cycle_start, cycle.cycle_end)}
                          </div>
                          <div className="text-xs text-ink/60">
                            {formatDaysRemaining(cycle.days_remaining)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusVariant(cycle.status)}>
                            {statusLabel(cycle.status)}
                          </Badge>
                          {cycle.warnings.length > 0 && (
                            <Badge variant="warning" className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {cycle.warnings.length} warning{cycle.warnings.length === 1 ? "" : "s"}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Progress value={progress} />
                      <div className="flex flex-wrap items-center justify-between text-xs text-ink/60">
                        <span>
                          {formatHours(cycle.earned_hours)} / {formatHours(cycle.required_hours)} hrs
                        </span>
                        <span>{formatHours(cycle.remaining_hours)} remaining</span>
                      </div>

                      {showCourses && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-ink/60">Applied courses</div>
                          {cycle.courses.length === 0 && (
                            <div className="text-xs text-ink/60">No courses applied yet.</div>
                          )}
                          {cycle.courses.map((course) => (
                            <button
                              key={course.id}
                              type="button"
                              onClick={() => setSelectedCourse(course)}
                              className="flex w-full items-center justify-between rounded-lg border border-stroke/60 px-3 py-2 text-left text-xs"
                            >
                              <span>
                                <div className="font-semibold text-ink">{course.title}</div>
                                <div className="text-ink/60">{formatDate(course.completed_at)}</div>
                              </span>
                              <span className="text-ink/60">{formatHours(course.hours)} hrs</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => setSelectedCycle(cycle)}>
                          Details
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  return (
    <TooltipProvider>
      <div className="sm:hidden">
        <PageHeader title="Timeline" subtitle="See course activity and deadline changes." />

        <div className="space-y-3 rounded-xl border border-stroke/60 bg-surface/80 p-3">
          <Tabs value={feedTab} onValueChange={setFeedTab}>
            <TabsList className="w-full justify-between">
              <TabsTrigger value="all" className="flex-1">
                All
              </TabsTrigger>
              <TabsTrigger value="courses" className="flex-1">
                Courses
              </TabsTrigger>
              <TabsTrigger value="cycles" className="flex-1">
                Cycles
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-ink/60">State filter</div>
            <ScrollArea className="w-full whitespace-nowrap">
              <ToggleGroup
                type="single"
                value={feedState}
                onValueChange={(value) => value && setFeedState(value)}
                className="flex w-max gap-2 pb-1"
              >
                <ToggleGroupItem value="all">All states</ToggleGroupItem>
                {stateOptions.map((stateCode) => (
                  <ToggleGroupItem key={stateCode} value={stateCode}>
                    {stateCode}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-ink/60">Time window</div>
            <ToggleGroup
              type="single"
              value={feedRange}
              onValueChange={(value) => value && setFeedRange(value)}
              className="flex gap-2"
            >
              <ToggleGroupItem value="6m">6m</ToggleGroupItem>
              <ToggleGroupItem value="12m">12m</ToggleGroupItem>
              <ToggleGroupItem value="all">All</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {eventsLoading && (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-20 w-full" />
              ))}
            </div>
          )}

          {!eventsLoading && groupedEvents.length === 0 && (
            <Card>
              <CardHeader>
                <div className="text-sm font-semibold">No events yet</div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-ink/70">Complete a course or add a cycle to see activity.</p>
              </CardContent>
            </Card>
          )}

          {!eventsLoading &&
            groupedEvents.map(([label, events]) => (
              <div key={label} className="space-y-3">
                <div className="relative">
                  <Separator />
                  <span className="absolute -top-2 left-3 bg-surface px-2 text-xs text-ink/60">
                    {label}
                  </span>
                </div>
                <div className="space-y-3">
                  {events.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <Card>
                        <CardContent className="space-y-2 pt-4">
                          <div className="flex items-center justify-between text-xs text-ink/60">
                            <span>{format(parseISO(event.occurred_at), "MMM d")}</span>
                            <span>{eventKindLabel(event.kind)}</span>
                          </div>
                          <div className="text-sm font-semibold text-ink">{event.title}</div>
                          {eventSubtitle(event) && (
                            <div className="text-xs text-ink/70">{eventSubtitle(event)}</div>
                          )}
                          {event.badges && event.badges.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {event.badges.slice(0, 2).map((badge) => (
                                <Badge key={`${event.id}-${badge}`} variant={badgeVariant(badge)}>
                                  {badge}
                                </Badge>
                              ))}
                              {event.badges.length > 2 && (
                                <Badge variant="secondary">+{event.badges.length - 2}</Badge>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="hidden sm:block">
        <PageHeader
          title="Timeline"
          subtitle="Monitor cycle progress and applied courses by state."
          actions={
            <div className="flex flex-wrap gap-2">
              <ToggleGroup
                type="single"
                value={desktopRange}
                onValueChange={(value) => value && setDesktopRange(value)}
                className="flex flex-wrap gap-2"
              >
                <ToggleGroupItem value="6m">6m</ToggleGroupItem>
                <ToggleGroupItem value="12m">12m</ToggleGroupItem>
                <ToggleGroupItem value="24m">24m</ToggleGroupItem>
                <ToggleGroupItem value="all">All</ToggleGroupItem>
              </ToggleGroup>
              <Tabs value={desktopView} onValueChange={setDesktopView} className="w-full sm:w-auto">
                <TabsList>
                  <TabsTrigger value="full">Cycles + Courses</TabsTrigger>
                  <TabsTrigger value="cycles">Cycles only</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          }
        />

        <Tabs value={desktopView} onValueChange={setDesktopView}>
          <TabsContent value="full" className="mt-0">
            {renderDesktopStates(true)}
          </TabsContent>
          <TabsContent value="cycles" className="mt-0">
            {renderDesktopStates(false)}
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={Boolean(selectedEvent)} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent>
          {selectedEvent && (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{selectedEvent.title}</SheetTitle>
              </SheetHeader>

              {isCourseEvent && (
                <div className="space-y-4">
                  <div className="space-y-2 text-sm text-ink/80">
                    <div className="font-semibold">{selectedMeta?.course?.title}</div>
                    {selectedMeta?.course?.provider && (
                      <div className="text-xs text-ink/60">{selectedMeta.course.provider}</div>
                    )}
                    {selectedMeta?.course?.completed_at && (
                      <div>{formatDate(selectedMeta.course.completed_at)}</div>
                    )}
                    {selectedMeta?.course?.hours && (
                      <div>{formatHours(selectedMeta.course.hours)} hours</div>
                    )}
                    {selectedMeta?.course?.has_certificate && (
                      <Badge variant="success" className="w-fit">
                        Certificate on file
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-ink/60">Allocations</div>
                    {selectedMeta?.allocations && selectedMeta.allocations.length > 0 ? (
                      selectedMeta.allocations.map((allocation) => (
                        <div key={allocation.cycle_id} className="text-xs text-ink/70">
                          {allocation.state_code}: {formatRange(allocation.cycle_start, allocation.cycle_end)}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-ink/60">Not applied to any cycles.</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-ink/60">Certificates</div>
                    {selectedMeta?.certificates && selectedMeta.certificates.length > 0 ? (
                      selectedMeta.certificates.map((cert) => (
                        <a
                          key={cert.id}
                          href={`/api/certificates/${cert.id}/download`}
                          className="flex items-center justify-between rounded-lg border border-stroke/60 px-3 py-2 text-xs"
                        >
                          <span className="flex items-center gap-2">
                            <Dot className="h-4 w-4" />
                            {cert.filename}
                          </span>
                          <span className="text-ink/60">{formatDate(cert.created_at)}</span>
                        </a>
                      ))
                    ) : (
                      <div className="text-xs text-ink/60">No certificates uploaded.</div>
                    )}
                  </div>

                  <Button asChild variant="outline">
                    <Link to="/courses">Edit in Courses</Link>
                  </Button>
                </div>
              )}

              {isCycleEvent && (
                <div className="space-y-4">
                  <div className="space-y-2 text-sm text-ink/80">
                    {selectedMeta?.cycle && (
                      <div>{formatRange(selectedMeta.cycle.cycle_start, selectedMeta.cycle.cycle_end)}</div>
                    )}
                    {selectedMeta?.cycle && (
                      <div>
                        {formatHours(selectedMeta.cycle.earned_hours)} / {formatHours(selectedMeta.cycle.required_hours)} hours
                      </div>
                    )}
                    {selectedMeta?.cycle?.status && (
                      <Badge variant={statusVariant(selectedMeta.cycle.status as TimelineCycle["status"])}>
                        {statusLabel(selectedMeta.cycle.status as TimelineCycle["status"])}
                      </Badge>
                    )}
                    {selectedMeta?.warnings && selectedMeta.warnings.length > 0 && (
                      <div className="text-xs text-ink/60">
                        <AlertTriangle className="mr-1 inline h-3 w-3" />
                        {selectedMeta.warnings.length} warning{selectedMeta.warnings.length === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-ink/60">Applied courses</div>
                    {selectedMeta?.courses && selectedMeta.courses.length > 0 ? (
                      selectedMeta.courses.map((course) => (
                        <div key={course.id} className="text-xs text-ink/70">
                          {course.title} · {formatDate(course.completed_at)} · {formatHours(course.hours)} hrs
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-ink/60">No courses applied yet.</div>
                    )}
                  </div>

                  <Button asChild variant="outline">
                    <Link to="/licenses">Edit in Licenses</Link>
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(selectedCycle)} onOpenChange={(open) => !open && setSelectedCycle(null)}>
        <SheetContent>
          {selectedCycle && (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{selectedCycle.state_code} Cycle</SheetTitle>
              </SheetHeader>
              <div className="space-y-2 text-sm text-ink/80">
                <div>{formatRange(selectedCycle.cycle_start, selectedCycle.cycle_end)}</div>
                <div>
                  {formatHours(selectedCycle.earned_hours)} / {formatHours(selectedCycle.required_hours)} hours
                </div>
                <Badge variant={statusVariant(selectedCycle.status)}>
                  {statusLabel(selectedCycle.status)}
                </Badge>
                {selectedCycle.warnings.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-ink/60">Warnings</div>
                    {selectedCycle.warnings.map((warning) => (
                      <div key={`${warning.course_id}-${warning.state_code}`} className="text-xs text-ink/70">
                        <AlertTriangle className="mr-1 inline h-3 w-3" />
                        {warning.course_title} appears in multiple cycles.
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-ink/60">Applied courses</div>
                {selectedCycle.courses.length === 0 && (
                  <div className="text-xs text-ink/60">No courses applied yet.</div>
                )}
                {selectedCycle.courses.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => setSelectedCourse(course)}
                    className="flex w-full items-center justify-between rounded-lg border border-stroke/60 px-3 py-2 text-left text-xs"
                  >
                    <span>
                      <div className="font-semibold text-ink">{course.title}</div>
                      <div className="text-ink/60">{formatDate(course.completed_at)}</div>
                    </span>
                    <span className="text-ink/60">{formatHours(course.hours)} hrs</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(selectedCourse)} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <SheetContent>
          {selectedCourse && (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{selectedCourse.title}</SheetTitle>
              </SheetHeader>
              <div className="space-y-2 text-sm text-ink/80">
                {selectedCourse.provider && (
                  <div className="text-xs text-ink/60">{selectedCourse.provider}</div>
                )}
                <div>{formatDate(selectedCourse.completed_at)}</div>
                <div>{formatHours(selectedCourse.hours)} hours</div>
                {selectedCourse.has_certificate && (
                  <Badge variant="success" className="w-fit">
                    Certificate on file
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-ink/60">Certificates</div>
                {selectedCourse.certificates.length === 0 && (
                  <div className="text-xs text-ink/60">No certificates uploaded.</div>
                )}
                {selectedCourse.certificates.map((cert) => (
                  <a
                    key={cert.id}
                    href={`/api/certificates/${cert.id}/download`}
                    className="flex items-center justify-between rounded-lg border border-stroke/60 px-3 py-2 text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <Dot className="h-4 w-4" />
                      {cert.filename}
                    </span>
                    <span className="text-ink/60">{formatDate(cert.created_at)}</span>
                  </a>
                ))}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-ink/60">Allocations</div>
                {states
                  .flatMap((state) => state.cycles)
                  .filter((cycle) => cycle.courses.some((course) => course.id === selectedCourse.id))
                  .map((cycle) => (
                    <div key={cycle.id} className="text-xs text-ink/70">
                      {cycle.state_code}: {formatRange(cycle.cycle_start, cycle.cycle_end)}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
