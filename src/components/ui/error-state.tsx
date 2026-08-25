import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/** Error panel with optional retry action. */
export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-6 text-center", className)}>
      <p className="flex items-center gap-1.5 text-sm text-red-600">
        <AlertCircle className="h-4 w-4" /> {message}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
