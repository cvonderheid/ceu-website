import { useQuery } from "@tanstack/react-query";

import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";

export default function Settings() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.getMe });

  return (
    <div>
      <PageHeader title="Settings" subtitle="Account details and sign-out." />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-ink/80">
            <div>
              <span className="font-semibold">User:</span>{" "}
              {me?.display_name || me?.email || "Unknown"}
            </div>
            <div>
              <span className="font-semibold">External ID:</span> {me?.external_user_id}
            </div>
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
