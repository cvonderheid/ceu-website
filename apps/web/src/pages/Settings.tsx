import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { api } from "@/lib/api";
import type { LicenseCycle, StateLicense } from "@/lib/types";

export default function Settings() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.getMe });
  const { data: licenses = [] } = useQuery({
    queryKey: ["state-licenses"],
    queryFn: api.listStateLicenses,
  });
  const { data: cycles = [] } = useQuery({
    queryKey: ["cycles"],
    queryFn: () => api.listCycles(),
  });

  const [licenseSheetOpen, setLicenseSheetOpen] = useState(false);
  const [licenseForm, setLicenseForm] = useState({ state_code: "", license_number: "" });
  const [editLicense, setEditLicense] = useState<StateLicense | null>(null);

  const [cycleSheetOpen, setCycleSheetOpen] = useState(false);
  const [cycleForm, setCycleForm] = useState({
    state_license_id: "",
    cycle_start: "",
    cycle_end: "",
    required_hours: "",
  });
  const [editCycle, setEditCycle] = useState<LicenseCycle | null>(null);

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

  const createLicense = useMutation({
    mutationFn: api.createStateLicense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state-licenses"] });
      toast.success("State license created");
      setLicenseSheetOpen(false);
      setLicenseForm({ state_code: "", license_number: "" });
    },
    onError: (error: any) => toast.error(error?.details || "Failed to create license"),
  });

  const updateLicense = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { license_number?: string | null } }) =>
      api.updateStateLicense(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state-licenses"] });
      toast.success("State license updated");
      setEditLicense(null);
      setLicenseSheetOpen(false);
    },
    onError: (error: any) => toast.error(error?.details || "Failed to update license"),
  });

  const deleteLicense = useMutation({
    mutationFn: api.deleteStateLicense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state-licenses"] });
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("State license removed");
    },
    onError: (error: any) => toast.error(error?.details || "Cannot delete license"),
  });

  const createCycle = useMutation({
    mutationFn: api.createCycle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("Cycle created");
      setCycleSheetOpen(false);
      setCycleForm({ state_license_id: "", cycle_start: "", cycle_end: "", required_hours: "" });
    },
    onError: (error: any) => toast.error(error?.details || "Failed to create cycle"),
  });

  const updateCycle = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => api.updateCycle(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("Cycle updated");
      setEditCycle(null);
      setCycleSheetOpen(false);
    },
    onError: (error: any) => toast.error(error?.details || "Failed to update cycle"),
  });

  const deleteCycle = useMutation({
    mutationFn: api.deleteCycle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycles"] });
      toast.success("Cycle deleted");
    },
    onError: (error: any) => toast.error(error?.details || "Failed to delete cycle"),
  });

  const openEditLicense = (license: StateLicense) => {
    setEditLicense(license);
    setLicenseForm({ state_code: license.state_code, license_number: license.license_number ?? "" });
    setLicenseSheetOpen(true);
  };

  const openCreateCycle = (licenseId: string) => {
    setEditCycle(null);
    setCycleForm({ state_license_id: licenseId, cycle_start: "", cycle_end: "", required_hours: "" });
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

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your licenses, cycles, and account details."
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-ink/80">
            <div><span className="font-semibold">User:</span> {me?.display_name || me?.email || "Unknown"}</div>
            <div><span className="font-semibold">External ID:</span> {me?.external_user_id}</div>
            <a className="text-accent hover:underline" href="/.auth/logout">Log out</a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>State licenses</CardTitle>
            <Sheet open={licenseSheetOpen} onOpenChange={setLicenseSheetOpen}>
              <SheetTrigger asChild>
                <Button size="sm" variant="soft">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>{editLicense ? "Edit license" : "New state license"}</SheetTitle>
                  <SheetDescription>Keep one license per state code.</SheetDescription>
                </SheetHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="state_code">State code</Label>
                    <Input
                      id="state_code"
                      value={licenseForm.state_code}
                      onChange={(event) =>
                        setLicenseForm((prev) => ({
                          ...prev,
                          state_code: event.target.value.toUpperCase(),
                        }))
                      }
                      maxLength={2}
                      disabled={Boolean(editLicense)}
                    />
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
                    onClick={() => {
                      if (editLicense) {
                        updateLicense.mutate({
                          id: editLicense.id,
                          payload: { license_number: licenseForm.license_number || null },
                        });
                        return;
                      }
                      createLicense.mutate({
                        state_code: licenseForm.state_code,
                        license_number: licenseForm.license_number || null,
                      });
                    }}
                  >
                    {editLicense ? "Save changes" : "Create license"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </CardHeader>
          <CardContent className="space-y-4">
            {licenses.length === 0 && (
              <div className="text-sm text-ink/70">No licenses yet.</div>
            )}
            {licenses.map((license) => (
              <div key={license.id} className="rounded-xl border border-stroke/60 bg-surface/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{license.state_code}</div>
                    <div className="text-sm text-ink/60">{license.license_number || "No license number"}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditLicense(license)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteLicense.mutate(license.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Cycles</span>
                    <Button size="sm" variant="soft" onClick={() => openCreateCycle(license.id)}>
                      <Plus className="h-4 w-4" />
                      Add cycle
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(groupedCycles.get(license.id) || []).map((cycle) => (
                      <div
                        key={cycle.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stroke/50 px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-semibold">
                            {cycle.cycle_start} - {cycle.cycle_end}
                          </div>
                          <div className="text-ink/60">Required: {cycle.required_hours} hours</div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEditCycle(cycle)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteCycle.mutate(cycle.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {(groupedCycles.get(license.id) || []).length === 0 && (
                      <div className="text-sm text-ink/60">No cycles for this state yet.</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Sheet open={cycleSheetOpen} onOpenChange={setCycleSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editCycle ? "Edit cycle" : "New cycle"}</SheetTitle>
            <SheetDescription>Cycle end date must be after start date.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cycle_start">Start date</Label>
              <Input
                id="cycle_start"
                type="date"
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
                type="date"
                value={cycleForm.cycle_end}
                onChange={(event) => setCycleForm((prev) => ({ ...prev, cycle_end: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="required_hours">Required hours</Label>
              <Input
                id="required_hours"
                type="number"
                step="0.25"
                value={cycleForm.required_hours}
                onChange={(event) =>
                  setCycleForm((prev) => ({ ...prev, required_hours: event.target.value }))
                }
              />
            </div>
            <Button
              onClick={() => {
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
              {editCycle ? "Save cycle" : "Create cycle"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
