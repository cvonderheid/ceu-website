import { useEffect, useMemo, useState } from "react";
import { ImageOff } from "lucide-react";

import { getValidAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|webp|bmp|heic|heif|tiff?)$/i;

export function isImageCertificate(contentType?: string | null, filename?: string): boolean {
  if (contentType?.toLowerCase().startsWith("image/")) {
    return true;
  }
  if (filename && IMAGE_FILE_PATTERN.test(filename)) {
    return true;
  }
  return false;
}

type CertificatePreviewProps = {
  certificateId: string;
  contentType?: string | null;
  filename: string;
  className?: string;
};

export default function CertificatePreview({
  certificateId,
  contentType,
  filename,
  className,
}: CertificatePreviewProps) {
  const previewable = useMemo(
    () => isImageCertificate(contentType, filename),
    [contentType, filename]
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    if (!previewable) {
      setPreviewUrl(null);
      setStatus("idle");
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    setStatus("loading");

    const run = async () => {
      try {
        const token = await getValidAccessToken();
        const headers = new Headers();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        const response = await fetch(`/api/certificates/${certificateId}/download`, {
          headers,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Certificate preview fetch failed");
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setPreviewUrl(objectUrl);
        setStatus("ready");
      } catch {
        if (!active || controller.signal.aborted) {
          return;
        }
        setPreviewUrl(null);
        setStatus("error");
      }
    };

    void run();

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [certificateId, previewable]);

  if (!previewable) {
    return null;
  }

  if (status === "ready" && previewUrl) {
    return (
      <img
        src={previewUrl}
        alt={`Certificate preview for ${filename}`}
        className={cn("h-24 w-24 shrink-0 rounded-md border border-stroke/60 object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-stroke/60 bg-mist text-xs text-ink/60",
        className
      )}
    >
      {status === "error" ? <ImageOff className="h-4 w-4" /> : "Loading..."}
    </div>
  );
}
