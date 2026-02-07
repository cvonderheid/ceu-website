import { useQuery } from "@tanstack/react-query";
import { CircleDashed } from "lucide-react";

import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";

export default function Settings() {
  const { data: me, isLoading, isError, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
  });

  const accountEmail = me?.email || null;
  const displayName =
    me?.display_name && me.display_name !== me.email ? me.display_name : null;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Account details and sign-out." />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-ink/80">
            {isLoading && <div className="text-ink/70">Loading account details...</div>}
            {isError && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg border border-stroke/70 bg-surface/70 px-3 py-2 text-ink/75">
                  <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink/55" />
                  <div>
                    We are still loading account details. You can continue using the app.
                    <div className="mt-1">
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-ink/70" onClick={() => void refetch()}>
                        Refresh
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!isLoading && !isError && (
              <>
                <div>
                  <span className="font-semibold">Email:</span> {accountEmail ?? "Not available"}
                </div>
                {displayName && (
                  <div>
                    <span className="font-semibold">Name:</span> {displayName}
                  </div>
                )}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                logout();
              }}
            >
              Log out
            </Button>
          </CardContent>
        </Card>

        {import.meta.env.DEV && (
          <Card>
            <CardHeader>
              <CardTitle>Demo data</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-ink/80">
              <div>To reseed the demo dataset, run:</div>
              <div className="font-mono text-xs">make demo</div>
              <div className="text-ink/60">
                Demo data is tied to DEV_USER_ID=demo-user-1.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
