import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

type StarRatingProps = {
  average: number | null;
  count: number;
  className?: string;
};

// Read-only summary: a 5-star row filled to the nearest half, the average to
// one decimal, and the rating count. Shows "No ratings yet" when count is 0.
export function StarRating({ average, count, className }: StarRatingProps) {
  if (count === 0 || average === null) {
    return (
      <span className={cn("text-sm italic text-muted-foreground", className)}>
        No ratings yet
      </span>
    );
  }

  return (
    <span
      className={cn("flex items-center gap-1.5", className)}
      role="img"
      aria-label={`Rated ${average.toFixed(1)} out of 5 (${count} rating${count === 1 ? "" : "s"})`}
    >
      <span className="flex items-center" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = Math.max(0, Math.min(1, average - (i - 1)));
          return <StarIcon key={i} fill={fill} />;
        })}
      </span>
      <span className="text-sm font-medium text-foreground">
        {average.toFixed(1)}
      </span>
      <span className="text-sm text-muted-foreground">({count})</span>
    </span>
  );
}

// A single star filled 0, 0.5, or 1 (rounded from a 0..1 fraction).
function StarIcon({ fill }: { fill: number }) {
  const rounded = fill >= 0.75 ? 1 : fill >= 0.25 ? 0.5 : 0;

  if (rounded === 1) {
    return <Star className="size-4 fill-yellow-400 text-yellow-400" />;
  }
  if (rounded === 0.5) {
    return (
      <span className="relative inline-block size-4">
        <Star className="absolute inset-0 size-4 text-yellow-400" />
        <span className="absolute inset-0 w-1/2 overflow-hidden">
          <Star className="size-4 fill-yellow-400 text-yellow-400" />
        </span>
      </span>
    );
  }
  return <Star className="size-4 text-muted-foreground/40" />;
}

type StarRatingInputProps = {
  currentRating: number | null;
};

// Interactive 1–5 star input for enrolled students. Submits to the current
// route's action via a fetcher (no navigation); the loader revalidates so the
// average refreshes. Pre-selects the user's existing rating; previews on hover.
// Shows a toast on the action result.
export function StarRatingInput({ currentRating }: StarRatingInputProps) {
  const fetcher = useFetcher();
  const [hover, setHover] = useState<number | null>(null);

  // While submitting, optimistically show the value being sent.
  const pending = fetcher.formData?.get("stars");
  const submitted = pending ? Number(pending) : null;
  const active = hover ?? submitted ?? currentRating ?? 0;

  const result = fetcher.data as { ok: boolean; error?: string } | undefined;
  useEffect(() => {
    if (fetcher.state === "idle" && result) {
      if (result.ok) toast.success("Thanks for rating!");
      else if (result.error) toast.error(result.error);
    }
  }, [fetcher.state, result]);

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Your rating</p>
      <fetcher.Form
        method="post"
        className="flex items-center gap-1"
        role="group"
        aria-label="Rate this course"
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="submit"
            name="stars"
            value={value}
            aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(value)}
            onMouseLeave={() => setHover(null)}
            className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={
                value <= active
                  ? "size-6 fill-yellow-400 text-yellow-400"
                  : "size-6 text-muted-foreground/40"
              }
            />
          </button>
        ))}
      </fetcher.Form>
    </div>
  );
}
