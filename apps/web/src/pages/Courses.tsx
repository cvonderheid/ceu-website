import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api, getApiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Certificate, Course, LicenseCycle, StateLicense } from "@/lib/types";

export default function Courses() {
  const queryClient = useQueryClient();
  const { data: courses = [] } = useQuery({ queryKey: ["courses"], queryFn: () => api.listCourses() });
  const { data: cycles = [] } = useQuery({ queryKey: ["cycles"], queryFn: () => api.listCycles() });
  const { data: licenses = [] } = useQuery({
    queryKey: ["state-licenses"],
    queryFn: api.listStateLicenses,
  });

  const [courseSheetOpen, setCourseSheetOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({
    title: "",
    provider: "",
    completed_at: "",
    hours: "",
  });
  const [editCourse, setEditCourse] = useState<Course | null>(null);

  const [applySheetOpen, setApplySheetOpen] = useState(false);
  const [applyCourse, setApplyCourse] = useState<Course | null>(null);
  const [selectedCycleIds, setSelectedCycleIds] = useState<string[]>([]);
  const [didInitSelections, setDidInitSelections] = useState(false);

  const [certSheetOpen, setCertSheetOpen] = useState(false);
  const [certCourse, setCertCourse] = useState<Course | null>(null);

  const certsQuery = useQuery({
    queryKey: ["certificates", certCourse?.id],
    queryFn: () => api.listCertificates(certCourse!.id),
    enabled: Boolean(certCourse?.id),
  });

  const allocationsQuery = useQuery({
    queryKey: ["allocations", applyCourse?.id],
    queryFn: () => api.listAllocations({ course_id: applyCourse!.id }),
    enabled: Boolean(applyCourse?.id),
  });

  const cyclesByLicense = useMemo(() => {
    const map = new Map<string, LicenseCycle[]>();
    cycles.forEach((cycle) => {
      if (!map.has(cycle.state_license_id)) {
        map.set(cycle.state_license_id, []);
      }
      map.get(cycle.state_license_id)?.push(cycle);
    });
    return map;
  }, [cycles]);

  const invalidateProgressViews = () => {
    queryClient.invalidateQueries({ queryKey: ["progress"] });
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: ["timeline-events"] });
  };

  const createCourse = useMutation({
    mutationFn: api.createCourse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      invalidateProgressViews();
      toast.success("Course created");
      setCourseSheetOpen(false);
      setCourseForm({ title: "", provider: "", completed_at: "", hours: "" });
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create course")),
  });

  const updateCourse = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        title?: string | null;
        provider?: string | null;
        completed_at?: string | null;
        hours?: string | null;
      };
    }) => api.updateCourse(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      invalidateProgressViews();
      toast.success("Course updated");
      setCourseSheetOpen(false);
      setEditCourse(null);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to update course")),
  });

  const deleteCourse = useMutation({
    mutationFn: api.deleteCourse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      invalidateProgressViews();
      toast.success("Course deleted");
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to delete course")),
  });

  const bulkAllocate = useMutation({
    mutationFn: api.bulkAllocate,
    onSuccess: (result) => {
      invalidateProgressViews();
      queryClient.invalidateQueries({ queryKey: ["allocations", applyCourse?.id] });
      toast.success(
        `Applied to ${result.created.length} cycles. Skipped ${result.skipped_cycle_ids.length}.`
      );
      setApplySheetOpen(false);
      setSelectedCycleIds([]);
      setApplyCourse(null);
      setDidInitSelections(false);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to apply course")),
  });

  const uploadCertificate = useMutation({
    mutationFn: ({ courseId, file }: { courseId: string; file: File }) =>
      api.uploadCertificate(courseId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificates", certCourse?.id] });
      invalidateProgressViews();
      toast.success("Certificate uploaded");
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Upload failed")),
  });

  const deleteCertificate = useMutation({
    mutationFn: api.deleteCertificate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificates", certCourse?.id] });
      invalidateProgressViews();
      toast.success("Certificate deleted");
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Delete failed")),
  });

  const openEditCourse = (course: Course) => {
    setEditCourse(course);
    setCourseForm({
      title: course.title,
      provider: course.provider ?? "",
      completed_at: course.completed_at,
      hours: course.hours,
    });
    setCourseSheetOpen(true);
  };

  const openApplySheet = (course: Course) => {
    setApplyCourse(course);
    setSelectedCycleIds([]);
    setDidInitSelections(false);
    setApplySheetOpen(true);
  };

  const openCertSheet = (course: Course) => {
    setCertCourse(course);
    setCertSheetOpen(true);
  };

  useEffect(() => {
    if (!applySheetOpen || !applyCourse || didInitSelections) {
      return;
    }
    if (!allocationsQuery.data) {
      return;
    }
    setSelectedCycleIds(allocationsQuery.data.map((allocation) => allocation.license_cycle_id));
    setDidInitSelections(true);
  }, [applyCourse, applySheetOpen, allocationsQuery.data, didInitSelections]);

  return (
    <div>
      <PageHeader
        title="Courses"
        subtitle="Track finished coursework and apply hours to cycles."
        actions={
          <Sheet open={courseSheetOpen} onOpenChange={setCourseSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="soft">
                <Plus className="h-4 w-4" />
                Add course
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{editCourse ? "Edit course" : "New course"}</SheetTitle>
                <SheetDescription>Hours are applied in full when allocated.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={courseForm.title}
                    onChange={(event) => setCourseForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Input
                    id="provider"
                    value={courseForm.provider}
                    onChange={(event) =>
                      setCourseForm((prev) => ({ ...prev, provider: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="completed_at">Completed</Label>
                  <Input
                    id="completed_at"
                    type="date"
                    value={courseForm.completed_at}
                    onChange={(event) =>
                      setCourseForm((prev) => ({ ...prev, completed_at: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours">Hours</Label>
                  <Input
                    id="hours"
                    type="number"
                    step="0.25"
                    value={courseForm.hours}
                    onChange={(event) => setCourseForm((prev) => ({ ...prev, hours: event.target.value }))}
                  />
                </div>
                <Button
                  onClick={() => {
                    if (editCourse) {
                      updateCourse.mutate({
                        id: editCourse.id,
                        payload: {
                          title: courseForm.title,
                          provider: courseForm.provider || null,
                          completed_at: courseForm.completed_at,
                          hours: courseForm.hours,
                        },
                      });
                      return;
                    }
                    createCourse.mutate({
                      title: courseForm.title,
                      provider: courseForm.provider || null,
                      completed_at: courseForm.completed_at,
                      hours: courseForm.hours,
                    });
                  }}
                >
                  {editCourse ? "Save changes" : "Create course"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      {courses.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No courses yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink/70">Add a completed course to get started.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {courses.map((course) => (
          <Card key={course.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{course.title}</CardTitle>
                  <p className="text-sm text-ink/70">
                    {course.provider || "Unknown provider"} - {formatDate(course.completed_at)}
                  </p>
                </div>
                <div className="text-right text-sm font-semibold">{course.hours} hrs</div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => openEditCourse(course)}>
                Edit
              </Button>
              <Button size="sm" variant="soft" onClick={() => openApplySheet(course)}>
                <Link2 className="h-4 w-4" />
                Apply to cycles
              </Button>
              <Button size="sm" variant="soft" onClick={() => openCertSheet(course)}>
                <FileUp className="h-4 w-4" />
                Certificates
              </Button>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => deleteCourse.mutate(course.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <Sheet
        open={applySheetOpen}
        onOpenChange={(open) => {
          setApplySheetOpen(open);
          if (!open) {
            setApplyCourse(null);
            setSelectedCycleIds([]);
            setDidInitSelections(false);
          }
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Apply course to cycles</SheetTitle>
            <SheetDescription>{applyCourse?.title}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            {allocationsQuery.isLoading && (
              <div className="text-sm text-ink/70">Loading allocations...</div>
            )}
            {licenses.length === 0 && (
              <div className="text-sm text-ink/70">No cycles available yet.</div>
            )}
            <div className="space-y-4">
              {licenses.map((license: StateLicense) => (
                <div key={license.id} className="space-y-2">
                  <div className="text-sm font-semibold">{license.state_code}</div>
                  {(cyclesByLicense.get(license.id) || []).map((cycle) => {
                    const checked = selectedCycleIds.includes(cycle.id);
                    return (
                      <label
                        key={cycle.id}
                        className="flex items-center gap-3 rounded-lg border border-stroke/60 px-3 py-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            setSelectedCycleIds((prev) => {
                              if (value) {
                                return [...prev, cycle.id];
                              }
                              return prev.filter((id) => id !== cycle.id);
                            });
                          }}
                        />
                        <div className="flex-1">
                          <div className="font-semibold">
                            {cycle.cycle_start} - {cycle.cycle_end}
                          </div>
                          <div className="text-xs text-ink/60">Required {cycle.required_hours} hrs</div>
                        </div>
                        {checked && <Check className="h-4 w-4 text-success" />}
                      </label>
                    );
                  })}
                  {(cyclesByLicense.get(license.id) || []).length === 0 && (
                    <div className="text-sm text-ink/60">No cycles in this state.</div>
                  )}
                </div>
              ))}
            </div>
            <Button
              onClick={() => {
                if (!applyCourse) {
                  return;
                }
                bulkAllocate.mutate({
                  course_id: applyCourse.id,
                  cycle_ids: selectedCycleIds,
                });
              }}
            >
              Apply
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={certSheetOpen} onOpenChange={setCertSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Certificates</SheetTitle>
            <SheetDescription>{certCourse?.title}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">Upload new file</Label>
              <Input
                id="file"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file || !certCourse) {
                    return;
                  }
                  uploadCertificate.mutate({ courseId: certCourse.id, file });
                  event.currentTarget.value = "";
                }}
              />
            </div>
            {certsQuery.isLoading && <div className="text-sm text-ink/70">Loading files...</div>}
            {!certsQuery.isLoading && (certsQuery.data || []).length === 0 && (
              <div className="text-sm text-ink/70">No certificates yet.</div>
            )}
            <div className="space-y-2">
              {(certsQuery.data || []).map((cert: Certificate) => (
                <div
                  key={cert.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stroke/60 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-semibold">{cert.filename}</div>
                    <div className="text-xs text-ink/60">{cert.content_type || "file"}</div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      className="text-accent hover:underline"
                      href={`/api/certificates/${cert.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                    <Button size="sm" variant="ghost" onClick={() => deleteCertificate.mutate(cert.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
