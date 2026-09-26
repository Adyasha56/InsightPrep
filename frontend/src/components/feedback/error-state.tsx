import { Alert } from "./alert";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert tone="danger" className="flex items-center justify-between gap-4">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-medium underline underline-offset-2 hover:text-coral">
          Try again
        </button>
      )}
    </Alert>
  );
}
