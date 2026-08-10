import { AlertCircle, CheckCircle2 } from "lucide-react";

export interface StatusBannerProps {
  error?: string | null;
  success?: string | null;
}

/**
 * Standard error/success banner pair used across admin pages. Rendered by
 * AdminPage, so pages normally just hand it their `error`/`success` state.
 */
export default function StatusBanner({ error, success }: StatusBannerProps) {
  if (!error && !success) return null;
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}
    </div>
  );
}
