import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { beginLogin, completeAuthCallback } from "@/lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        const returnTo = await completeAuthCallback(window.location.href);
        if (!active) {
          return;
        }
        navigate(returnTo, { replace: true });
      } catch {
        if (!active) {
          return;
        }
        setError("Could not complete sign in. Please try again.");
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [navigate]);

  if (!error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-ink/70">
        Completing sign in...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="space-y-3 text-center">
        <div className="text-sm text-danger">{error}</div>
        <Button
          onClick={() => {
            void beginLogin("/dashboard");
          }}
        >
          Try sign in again
        </Button>
      </div>
    </div>
  );
}
