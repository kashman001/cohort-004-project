import { Star } from "lucide-react";
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
