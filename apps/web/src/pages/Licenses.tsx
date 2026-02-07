import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api, getApiErrorMessage } from "@/lib/api";
import { formatRange } from "@/lib/format";
import type { LicenseCycle, StateLicense } from "@/lib/types";
import { US_STATE_CODES, US_STATES } from "@/lib/usStates";

const emptyLicenseForm = { state_code: "", license_number: "" };
const emptyCycleForm = {
  state_license_id: "",
  cycle_start: "",
  cycle_end: "",
  required_hours: "",
};
const CYCLE_HOUR_STEP = 0.25;

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function formatQuarterHours(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

export default function Licenses() {
  const queryClient = useQueryClient();
  const { data: licenses = [] } = useQuery({
    queryKey: ["state-licenses"],
    queryFn: api.listStateLicenses,
  });
  const { data: cycles = [] } = useQuery({
    queryKey: ["cycles"],
    queryFn: () => api.listCycles(),
  });

  const [licenseSheetOpen, setLicenseSheetOpen] = useState(false);
  const [licenseForm, setLicenseForm] = useState(emptyLicenseForm);
  const [editLicense, setEditLicense] = useState<StateLicense | null>(null);

  const [cycleSheetOpen, setCycleSheetOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState(emptyCycleForm);
  const [editCycle, setEditCycle] = useState<LicenseCycle | null>(null);
  const [confirmLicenseDeleteId, setConfirmLicenseDeleteId] = useState<string | null>(null);
  const [confirmCycleDeleteId, setConfirmCycleDeleteId] = useState<string | null>(null);

  const groupedCycles = useMemo(() => {
    const map = new Map<string, LicenseCycle[]>();
    cycles.forEach((cycle) => {
      if (!map.has(cycle.state_license_id)) {
        map.set(cycle.state_license_id, []);
      }
      map.get(cycle.state_license_id)?.push(cycle);
    });
    return map;
  }, [cycles]);

  const stateNameByCode = useMemo(
    () => new Map(US_STATES.map((state) => [state.code, state.name])),
    []
  );

  const invalidateProgressViews = () => {
    queryClient.invalidateQueries({ queryKey: ["progress"] });
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
    queryClient.invalidateQueries({ queryKey: ["timeline-events"] });
  };

  const createLicense = useMutation({
    mutationFn: api.createStateLicense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state-licenses"] });
      invalidateProgressViews();
      toast.success("State license created");
      setLicenseSheetOpen(false);
      setLicenseForm(emptyLicenseForm);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create license")),
  });

  const updateLicense = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { license_number?: string | null } }) =>
      api.updateStateLicense(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state-licenses"] });
      invalidateProgressViews();
      toast.success("State license updated");
      setEditLicense(null);
      setLicenseSheetOpen(false);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to update license")),
  });

  const deleteLicense = useMutation({
    mutationFn: api.deleteStateLicense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state-licenses"] });
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      invalidateProgressViews();
      setConfirmLicenseDeleteId(null);
      toast.success("State license removed");
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Cannot delete license")),
  });

  const createCycle = useMutation({
    mutationFn: api.createCycle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      invalidateProgressViews();
      toast.success("Cycle created");
      setCycleSheetOpen(false);
      setCycleForm(emptyCycleForm);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to create cycle")),
  });

  const updateCycle = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        cycle_start?: string | null;
        cycle_end?: string | null;
        required_hours?: string | null;
      };
    }) => api.updateCycle(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      invalidateProgressViews();
      toast.success("Cycle updated");
      setEditCycle(null);
      setCycleSheetOpen(false);
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to update cycle")),
  });

  const deleteCycle = useMutation({
    mutationFn: api.deleteCycle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      invalidateProgressViews();
      setConfirmCycleDeleteId(null);
      toast.success("Cycle deleted");
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, "Failed to delete cycle")),
  });

  const openCreateLicense = () => {
    setEditLicense(null);
    setLicenseForm(emptyLicenseForm);
    setConfirmLicenseDeleteId(null);
    setLicenseSheetOpen(true);
  };

  const openEditLicense = (license: StateLicense) => {
    setEditLicense(license);
    setLicenseForm({ state_code: license.state_code, license_number: license.license_number ?? "" });
    setLicenseSheetOpen(true);
  };

  const openCreateCycle = (licenseId: string) => {
    setEditCycle(null);
    setCycleForm({ ...emptyCycleForm, state_license_id: licenseId });
    setCycleSheetOpen(true);
  };

  const openEditCycle = (cycle: LicenseCycle) => {
    setEditCycle(cycle);
    setCycleForm({
      state_license_id: cycle.state_license_id,
      cycle_start: cycle.cycle_start,
      cycle_end: cycle.cycle_end,
      required_hours: cycle.required_hours,
    });
    setCycleSheetOpen(true);
  };

  const normalizedStateCode = licenseForm.state_code.trim().toUpperCase();
  const isLicenseFormValid = editLicense ? true : US_STATE_CODES.has(normalizedStateCode);
  const licenseFormHint = editLicense
    ? "Update the license number and save."
    : isLicenseFormValid
      ? "Ready to create."
      : "Select a state.";

  const cycleHours = Number(cycleForm.required_hours);
  const cycleStart = cycleForm.cycle_start ? parseIsoDate(cycleForm.cycle_start) : null;
  const cycleEnd = cycleForm.cycle_end ? parseIsoDate(cycleForm.cycle_end) : null;
  const hasValidCycleDates = Boolean(
    cycleStart &&
      cycleEnd &&
      cycleEnd > cycleStart
  );
  const hasValidCycleHours = Number.isFinite(cycleHours) && cycleHours > 0;
  const isCycleFormValid =
    Boolean(cycleForm.state_license_id) && hasValidCycleDates && hasValidCycleHours;
  const cycleFormHint = (() => {
    if (!cycleForm.cycle_start || !cycleForm.cycle_end) {
      return "Add both start and end dates.";
    }
    if (!cycleStart || !cycleEnd) {
      return "Use YYYY-MM-DD format.";
    }
    if (!hasValidCycleDates) {
      return "End date must be after start date.";
    }
    if (!hasValidCycleHours) {
      return "Required hours must be greater than 0.";
    }
    return "Ready to save.";
  })();

  const adjustCycleHours = (delta: number) => {
    setCycleForm((prev) => {
      const currentHours = Number(prev.required_hours);
      const current = Number.isFinite(currentHours) && currentHours > 0 ? currentHours : 0;
      const next = Math.max(CYCLE_HOUR_STEP, Math.round((current + delta) * 4) / 4);
      return { ...prev, required_hours: formatQuarterHours(next) };
    });
  };

  return (
    <div>
      <PageHeader
        title="Licenses"
        subtitle="Track your state licenses and renewal cycles."
        actions={
          <Button size="sm" variant="soft" onClick={openCreateLicense}>
            <Plus className="h-4 w-4" />
            Add state
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          {licenses.length === 0 && (
            <div className="text-sm text-ink/70">No licenses yet.</div>
          )}
          {licenses.map((license) => (
            <div key={license.id} className="space-y-3 rounded-xl border border-stroke/60 bg-surface/85 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">
                    {license.state_code}
                    {stateNameByCode.get(license.state_code) && (
                      <span className="ml-2 text-sm font-normal text-ink/60">
                        {stateNameByCode.get(license.state_code)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-ink/60">
                    License #: {license.license_number || "Not set"}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => openEditLicense(license)}
                    aria-label="Edit state license"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-ink/70"
                    onClick={() => setConfirmLicenseDeleteId(license.id)}
                    aria-label="Delete state license"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {confirmLicenseDeleteId === license.id && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-ink/80">
                  <span>Delete this state and its cycles?</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmLicenseDeleteId(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={deleteLicense.isPending}
                      onClick={() => deleteLicense.mutate(license.id)}
                    >
                      {deleteLicense.isPending ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Cycles</span>
                <Button size="sm" variant="soft" onClick={() => openCreateCycle(license.id)}>
                  <Plus className="h-4 w-4" />
                  Add cycle
                </Button>
              </div>

              <div className="space-y-2">
                {(groupedCycles.get(license.id) || []).map((cycle) => (
                  <div key={cycle.id} className="rounded-lg border border-stroke/50 bg-surface px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm">
                        <div className="font-semibold">
                          {formatRange(cycle.cycle_start, cycle.cycle_end)}
                        </div>
                        <div className="text-ink/60">Required: {cycle.required_hours} hours</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => openEditCycle(cycle)}
                          aria-label="Edit cycle"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-ink/70"
                          onClick={() => setConfirmCycleDeleteId(cycle.id)}
                          aria-label="Delete cycle"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {confirmCycleDeleteId === cycle.id && (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-danger/30 bg-danger/10 px-2 py-2 text-xs text-ink/80">
                        <span>Delete this cycle?</span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setConfirmCycleDeleteId(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={deleteCycle.isPending}
                            onClick={() => deleteCycle.mutate(cycle.id)}
                          >
                            {deleteCycle.isPending ? "Deleting..." : "Delete"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {(groupedCycles.get(license.id) || []).length === 0 && (
                  <div className="rounded-lg border border-dashed border-stroke/70 bg-surface/70 px-3 py-3 text-sm text-ink/60">
                    No cycles for this state yet.
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Sheet
        open={licenseSheetOpen}
        onOpenChange={(open) => {
          setLicenseSheetOpen(open);
          if (!open) {
            setEditLicense(null);
          }
        }}
      >
        <SheetContent
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>{editLicense ? "Edit license" : "New state license"}</SheetTitle>
            <SheetDescription>Keep one license per state code.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="state_code">State code</Label>
              <select
                id="state_code"
                value={licenseForm.state_code}
                onChange={(event) =>
                  setLicenseForm((prev) => ({
                    ...prev,
                    state_code: event.target.value.toUpperCase(),
                  }))
                }
                disabled={Boolean(editLicense)}
                className="flex h-11 w-full rounded-lg border border-stroke bg-surface px-3 py-2 text-base shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:text-sm"
              >
                <option value="">Select a state...</option>
                {US_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.code} - {state.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="license_number">License number</Label>
              <Input
                id="license_number"
                value={licenseForm.license_number}
                onChange={(event) =>
                  setLicenseForm((prev) => ({
                    ...prev,
                    license_number: event.target.value,
                  }))
                }
              />
            </div>
            <Button
              disabled={!isLicenseFormValid || createLicense.isPending || updateLicense.isPending}
              onClick={() => {
                if (!isLicenseFormValid) {
                  return;
                }
                if (editLicense) {
                  updateLicense.mutate({
                    id: editLicense.id,
                    payload: { license_number: licenseForm.license_number || null },
                  });
                  return;
                }
                createLicense.mutate({
                  state_code: normalizedStateCode,
                  license_number: licenseForm.license_number || null,
                });
              }}
            >
              {editLicense
                ? updateLicense.isPending
                  ? "Saving..."
                  : "Save license"
                : createLicense.isPending
                  ? "Creating..."
                  : "Create license"}
            </Button>
            <p className="text-xs text-ink/60">{licenseFormHint}</p>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={cycleSheetOpen}
        onOpenChange={(open) => {
          setCycleSheetOpen(open);
          if (!open) {
            setEditCycle(null);
          }
        }}
      >
        <SheetContent
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <SheetHeader>
            <SheetTitle>{editCycle ? "Edit cycle" : "New cycle"}</SheetTitle>
            <SheetDescription>
              Enter dates in YYYY-MM-DD format. End date must be after start date.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cycle_start">Start date</Label>
              <Input
                id="cycle_start"
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={cycleForm.cycle_start}
                onChange={(event) =>
                  setCycleForm((prev) => ({ ...prev, cycle_start: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycle_end">End date</Label>
              <Input
                id="cycle_end"
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                value={cycleForm.cycle_end}
                onChange={(event) =>
                  setCycleForm((prev) => ({ ...prev, cycle_end: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="required_hours">Required hours</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => adjustCycleHours(-CYCLE_HOUR_STEP)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="required_hours"
                  type="number"
                  min={CYCLE_HOUR_STEP}
                  step={CYCLE_HOUR_STEP}
                  inputMode="decimal"
                  value={cycleForm.required_hours}
                  onChange={(event) =>
                    setCycleForm((prev) => ({ ...prev, required_hours: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => adjustCycleHours(CYCLE_HOUR_STEP)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-ink/60">
                Use +/- or type a number (quarter-hour increments supported).
              </p>
            </div>
            <Button
              disabled={!isCycleFormValid || createCycle.isPending || updateCycle.isPending}
              onClick={() => {
                if (!isCycleFormValid) {
                  return;
                }
                const payload = {
                  state_license_id: cycleForm.state_license_id,
                  cycle_start: cycleForm.cycle_start,
                  cycle_end: cycleForm.cycle_end,
                  required_hours: cycleForm.required_hours,
                };
                if (editCycle) {
                  updateCycle.mutate({
                    id: editCycle.id,
                    payload: {
                      cycle_start: payload.cycle_start,
                      cycle_end: payload.cycle_end,
                      required_hours: payload.required_hours,
                    },
                  });
                  return;
                }
                createCycle.mutate(payload);
              }}
            >
              {editCycle
                ? updateCycle.isPending
                  ? "Saving..."
                  : "Save cycle"
                : createCycle.isPending
                  ? "Creating..."
                  : "Create cycle"}
            </Button>
            <p className="text-xs text-ink/60">{cycleFormHint}</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
