import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

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

  const accountName = me?.display_name || me?.email || null;
  const externalId = me?.external_user_id || null;

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
                <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    We could not load account details right now.
                    <div className="mt-1">
                      <Button size="sm" variant="outline" onClick={() => void refetch()}>
                        Retry
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!isLoading && !isError && (
              <>
                <div>
                  <span className="font-semibold">User:</span> {accountName ?? "Not available"}
                </div>
                <div>
                  <span className="font-semibold">External ID:</span> {externalId ?? "Not available"}
                </div>
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
