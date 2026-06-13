# Course Star Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let enrolled students rate a course 1–5 stars and show the average (stars + number + count) on the catalog list and course detail pages.

**Architecture:** A new `course_ratings` table (unique per user+course) is the source of truth. A new `ratingService.ts` owns all reads/writes, including live `AVG`/`COUNT` aggregates. A reusable `star-rating.tsx` renders a read-only summary and an interactive input; the input posts to the detail route's `action` via a React Router fetcher, which revalidates the loader so the UI refreshes.

**Tech Stack:** React Router 7, Drizzle ORM, better-sqlite3, Vitest, Tailwind + Lucide icons.

**Spec:** `docs/superpowers/specs/2026-06-12-course-star-ratings-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `app/db/schema.ts` | Add `courseRatings` table + unique index | Modify |
| `drizzle/0003_*.sql` | Generated migration | Create (via CLI) |
| `app/services/ratingService.ts` | All rating reads/writes + aggregates | Create |
| `app/services/ratingService.test.ts` | Service tests | Create |
| `app/components/star-rating.tsx` | `StarRating` (read-only) + `StarRatingInput` | Create |
| `app/routes/courses.$slug.tsx` | Loader summary+user rating, `action`, render | Modify |
| `app/routes/courses.tsx` | Loader batch summaries, render in card | Modify |

Conventions to follow (already in the codebase):
- Services use positional params, direct `db` calls, `sql` for aggregates (see `enrollmentService.ts`).
- Tests use `createTestDb()` + `seedBaseData()` from `~/test/setup` and `vi.mock("~/db")` (see `enrollmentService.test.ts`).
- No React component-test library exists; UI is verified by `pnpm typecheck` + manual run.

---

## Task 1: Schema + migration for `course_ratings`

**Files:**
- Modify: `app/db/schema.ts` (imports line 1; append table after `videoWatchEvents`, ~line 255)
- Create: `drizzle/0003_*.sql` (generated)

- [ ] **Step 1: Add `uniqueIndex` to the schema import**

In `app/db/schema.ts` line 1, change:

```ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
```

to:

```ts
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
```

- [ ] **Step 2: Append the `courseRatings` table**

At the end of `app/db/schema.ts` (after the `videoWatchEvents` table), add:

```ts
export const courseRatings = sqliteTable(
  "course_ratings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id),
    stars: integer("stars").notNull(), // 1–5
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => ({
    userCourseUnique: uniqueIndex("course_ratings_user_course_unique").on(
      table.userId,
      table.courseId
    ),
  })
);
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `drizzle/0003_*.sql` is created containing `CREATE TABLE \`course_ratings\`` and `CREATE UNIQUE INDEX \`course_ratings_user_course_unique\``. The journal `drizzle/meta/_journal.json` gains an entry.

- [ ] **Step 4: Apply the migration to the dev database**

Run: `pnpm db:migrate`
Expected: command completes without error. (Test DBs apply migrations automatically via `createTestDb`.)

- [ ] **Step 5: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no type errors).

- [ ] **Step 6: Commit**

```bash
git add app/db/schema.ts drizzle/
git commit -m "feat: add course_ratings table and migration"
```

---

## Task 2: `submitRating` + `getUserRating` (TDD)

**Files:**
- Create: `app/services/ratingService.ts`
- Create: `app/services/ratingService.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `app/services/ratingService.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after the mock so the module picks up our test db
import { submitRating, getUserRating } from "./ratingService";

function enroll(userId: number, courseId: number) {
  testDb
    .insert(schema.enrollments)
    .values({ userId, courseId })
    .returning()
    .get();
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("submitRating", () => {
    it("creates a rating for an enrolled user", () => {
      enroll(base.user.id, base.course.id);

      const rating = submitRating(base.user.id, base.course.id, 4);

      expect(rating.userId).toBe(base.user.id);
      expect(rating.courseId).toBe(base.course.id);
      expect(rating.stars).toBe(4);
    });

    it("updates the existing rating on re-submit (no duplicate row)", () => {
      enroll(base.user.id, base.course.id);

      submitRating(base.user.id, base.course.id, 3);
      submitRating(base.user.id, base.course.id, 5);

      expect(getUserRating(base.user.id, base.course.id)).toBe(5);

      const rows = testDb
        .select()
        .from(schema.courseRatings)
        .where(eq(schema.courseRatings.courseId, base.course.id))
        .all();
      expect(rows).toHaveLength(1);
    });

    it("rejects a user who is not enrolled", () => {
      expect(() =>
        submitRating(base.user.id, base.course.id, 4)
      ).toThrowError("Only enrolled students can rate this course");
    });

    it("rejects stars below 1", () => {
      enroll(base.user.id, base.course.id);
      expect(() =>
        submitRating(base.user.id, base.course.id, 0)
      ).toThrowError("Rating must be a whole number between 1 and 5");
    });

    it("rejects stars above 5", () => {
      enroll(base.user.id, base.course.id);
      expect(() =>
        submitRating(base.user.id, base.course.id, 6)
      ).toThrowError("Rating must be a whole number between 1 and 5");
    });
  });

  describe("getUserRating", () => {
    it("returns the user's current star value", () => {
      enroll(base.user.id, base.course.id);
      submitRating(base.user.id, base.course.id, 2);

      expect(getUserRating(base.user.id, base.course.id)).toBe(2);
    });

    it("returns null when the user has not rated", () => {
      expect(getUserRating(base.user.id, base.course.id)).toBeNull();
    });
  });
});
```

Note: add the `eq` import the test uses. At the top of the test, alongside the other imports, add:

```ts
import { eq } from "drizzle-orm";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run app/services/ratingService.test.ts`
Expected: FAIL — cannot resolve `./ratingService` (module does not exist yet).

- [ ] **Step 3: Create `ratingService.ts` with the two functions**

Create `app/services/ratingService.ts`:

```ts
import { eq, and } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";
import { isUserEnrolled } from "./enrollmentService";

// ─── Rating Service ───
// Handles course star ratings: submit (upsert), read a user's rating,
// and live AVG/COUNT aggregates. Uses positional parameters (project convention).

export function submitRating(userId: number, courseId: number, stars: number) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error("Rating must be a whole number between 1 and 5");
  }

  if (!isUserEnrolled(userId, courseId)) {
    throw new Error("Only enrolled students can rate this course");
  }

  return db
    .insert(courseRatings)
    .values({ userId, courseId, stars })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { stars, updatedAt: new Date().toISOString() },
    })
    .returning()
    .get();
}

export function getUserRating(userId: number, courseId: number): number | null {
  const row = db
    .select({ stars: courseRatings.stars })
    .from(courseRatings)
    .where(
      and(
        eq(courseRatings.userId, userId),
        eq(courseRatings.courseId, courseId)
      )
    )
    .get();

  return row?.stars ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run app/services/ratingService.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/services/ratingService.ts app/services/ratingService.test.ts
git commit -m "feat: add submitRating and getUserRating to ratingService"
```

---

## Task 3: `getCourseRatingSummary` + `getRatingSummariesForCourses` (TDD)

**Files:**
- Modify: `app/services/ratingService.ts`
- Modify: `app/services/ratingService.test.ts`

- [ ] **Step 1: Add the failing tests**

In `app/services/ratingService.test.ts`, update the import line:

```ts
import { submitRating, getUserRating } from "./ratingService";
```

to:

```ts
import {
  submitRating,
  getUserRating,
  getCourseRatingSummary,
  getRatingSummariesForCourses,
} from "./ratingService";
```

Then add a second enrolled user + second course helper and new `describe` blocks. Insert this inside the top-level `describe("ratingService", ...)` block, after the `getUserRating` block:

```ts
  function makeUser(email: string) {
    return testDb
      .insert(schema.users)
      .values({ name: email, email, role: schema.UserRole.Student })
      .returning()
      .get();
  }

  function makeCourse(slug: string) {
    return testDb
      .insert(schema.courses)
      .values({
        title: slug,
        slug,
        description: "x",
        instructorId: base.instructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
  }

  describe("getCourseRatingSummary", () => {
    it("returns the average and count of ratings", () => {
      const u2 = makeUser("u2@example.com");
      enroll(base.user.id, base.course.id);
      enroll(u2.id, base.course.id);

      submitRating(base.user.id, base.course.id, 5);
      submitRating(u2.id, base.course.id, 4);

      const summary = getCourseRatingSummary(base.course.id);
      expect(summary.count).toBe(2);
      expect(summary.average).toBeCloseTo(4.5);
    });

    it("returns null average and 0 count when there are no ratings", () => {
      const summary = getCourseRatingSummary(base.course.id);
      expect(summary.average).toBeNull();
      expect(summary.count).toBe(0);
    });
  });

  describe("getRatingSummariesForCourses", () => {
    it("groups summaries by course in one query", () => {
      const course2 = makeCourse("course-2");
      const u2 = makeUser("u2b@example.com");

      enroll(base.user.id, base.course.id);
      enroll(u2.id, base.course.id);
      enroll(base.user.id, course2.id);

      submitRating(base.user.id, base.course.id, 4);
      submitRating(u2.id, base.course.id, 2);
      submitRating(base.user.id, course2.id, 5);

      const map = getRatingSummariesForCourses([base.course.id, course2.id]);

      expect(map.get(base.course.id)!.count).toBe(2);
      expect(map.get(base.course.id)!.average).toBeCloseTo(3);
      expect(map.get(course2.id)!.count).toBe(1);
      expect(map.get(course2.id)!.average).toBeCloseTo(5);
    });

    it("returns an empty map for an empty id list", () => {
      const map = getRatingSummariesForCourses([]);
      expect(map.size).toBe(0);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run app/services/ratingService.test.ts`
Expected: FAIL — `getCourseRatingSummary` / `getRatingSummariesForCourses` are not exported.

- [ ] **Step 3: Implement the two aggregate functions**

In `app/services/ratingService.ts`, update the imports:

```ts
import { eq, and } from "drizzle-orm";
```

to:

```ts
import { eq, and, inArray, sql } from "drizzle-orm";
```

Then append to the file:

```ts
export type RatingSummary = { average: number | null; count: number };

export function getCourseRatingSummary(courseId: number): RatingSummary {
  const row = db
    .select({
      average: sql<number | null>`avg(${courseRatings.stars})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return { average: row?.average ?? null, count: row?.count ?? 0 };
}

export function getRatingSummariesForCourses(
  courseIds: number[]
): Map<number, RatingSummary> {
  const map = new Map<number, RatingSummary>();
  if (courseIds.length === 0) return map;

  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number | null>`avg(${courseRatings.stars})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();

  for (const row of rows) {
    map.set(row.courseId, {
      average: row.average ?? null,
      count: row.count ?? 0,
    });
  }
  return map;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run app/services/ratingService.test.ts`
Expected: PASS — all tests green (11 total).

- [ ] **Step 5: Commit**

```bash
git add app/services/ratingService.ts app/services/ratingService.test.ts
git commit -m "feat: add rating summary aggregates to ratingService"
```

---

## Task 4: `StarRating` read-only component

**Files:**
- Create: `app/components/star-rating.tsx`

- [ ] **Step 1: Create the component file with the read-only view**

Create `app/components/star-rating.tsx`:

```tsx
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
    <span className={cn("flex items-center gap-1.5", className)}>
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS. (`cn` is exported from `app/lib/utils.ts` — confirmed in the codebase.)

- [ ] **Step 3: Commit**

```bash
git add app/components/star-rating.tsx
git commit -m "feat: add read-only StarRating component"
```

---

## Task 5: `StarRatingInput` interactive component

**Files:**
- Modify: `app/components/star-rating.tsx`

- [ ] **Step 1: Add the interactive input to the component file**

Append to `app/components/star-rating.tsx`:

```tsx
import { useState } from "react";
import { useFetcher } from "react-router";

type StarRatingInputProps = {
  currentRating: number | null;
};

// Interactive 1–5 star input for enrolled students. Submits to the current
// route's action via a fetcher (no navigation); the loader revalidates so the
// average refreshes. Pre-selects the user's existing rating; previews on hover.
export function StarRatingInput({ currentRating }: StarRatingInputProps) {
  const fetcher = useFetcher();
  const [hover, setHover] = useState<number | null>(null);

  // While submitting, optimistically show the value being sent.
  const pending = fetcher.formData?.get("stars");
  const submitted = pending ? Number(pending) : null;
  const active = hover ?? submitted ?? currentRating ?? 0;

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Your rating</p>
      <fetcher.Form method="post" className="flex items-center gap-1">
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/components/star-rating.tsx
git commit -m "feat: add interactive StarRatingInput component"
```

---

## Task 6: Wire the course detail page

**Files:**
- Modify: `app/routes/courses.$slug.tsx`

- [ ] **Step 1: Add service + component imports**

In `app/routes/courses.$slug.tsx`, after the existing `isUserEnrolled` import (line 9), add:

```ts
import {
  getCourseRatingSummary,
  getUserRating,
  submitRating,
} from "~/services/ratingService";
```

And after the `UserAvatar` import (line 37), add:

```ts
import { StarRating, StarRatingInput } from "~/components/star-rating";
```

- [ ] **Step 2: Load the summary and the user's rating**

In the `loader`, after the `currentUserId` block resolves `enrolled` (i.e. after line ~90 where `nextLessonId` is set, but still inside the function), compute the rating data. Add just before the `// Render sales copy` comment (~line 91):

```ts
  const ratingSummary = getCourseRatingSummary(course.id);
  const userRating =
    currentUserId && enrolled
      ? getUserRating(currentUserId, course.id)
      : null;
```

Then add both to the returned object (the `return { course, ... }` block, ~line 105):

```ts
    ratingSummary,
    userRating,
```

- [ ] **Step 3: Add the route `action`**

Replace the comment on line 119:

```ts
// No action — enrollment is handled via the purchase confirmation page
```

with:

```ts
export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    return data({ ok: false, error: "You must be signed in." }, { status: 401 });
  }

  const course = getCourseBySlug(params.slug);
  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const formData = await request.formData();
  const stars = Number(formData.get("stars"));

  try {
    submitRating(currentUserId, course.id, stars);
    return data({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save rating.";
    return data({ ok: false, error: message }, { status: 400 });
  }
}
```

(`data`, `getCourseBySlug`, and `getCurrentUserId` are already imported in this file.)

- [ ] **Step 4: Destructure the new loader fields**

In `CourseDetail`, add to the `loaderData` destructure (the `const { course, ... } = loaderData;` block, ~line 173):

```ts
    ratingSummary,
    userRating,
```

- [ ] **Step 5: Show a toast on the action result**

Inside `CourseDetail`, add a fetcher-result effect. First add `useFetcher` to the existing `react-router` import (line 2: `import { Link, useSearchParams } from "react-router";` → add `useFetcher`). It is simplest to read the rating result from the input's own fetcher, so instead pass a toast down — but to keep the component self-contained, add this near the existing `useEffect` (~line 188):

```tsx
  // (Rating submission feedback is handled inside StarRatingInput via its fetcher.)
```

Then update `StarRatingInput` in Task 5 is already self-contained for submission; surface errors by adding a toast there. Add to `app/components/star-rating.tsx` inside `StarRatingInput`, after the `const active = ...` line:

```tsx
  const result = fetcher.data as { ok: boolean; error?: string } | undefined;
  useEffect(() => {
    if (fetcher.state === "idle" && result) {
      if (result.ok) toast.success("Thanks for rating!");
      else if (result.error) toast.error(result.error);
    }
  }, [fetcher.state, result]);
```

And add these imports to the top of `app/components/star-rating.tsx`:

```tsx
import { useEffect } from "react";
import { toast } from "sonner";
```

(Update the existing `import { useState } from "react";` to `import { useEffect, useState } from "react";`.)

- [ ] **Step 6: Render the read-only summary in the hero**

In the hero metadata row (the `<div className="flex items-center gap-4 text-sm text-muted-foreground">` at ~line 304), add as the first child, before the instructor `<span>`:

```tsx
          <StarRating
            average={ratingSummary.average}
            count={ratingSummary.count}
          />
```

- [ ] **Step 7: Render the input for enrolled students**

In the right-column card, inside the `enrolled ? ( ... )` branch (the `<>...</>` starting ~line 383), add after the progress bar `<div>` (after the closing of the progress bar block, before the `{course.modules.length > 0 && ...}` line):

```tsx
                  <div className="border-t pt-4">
                    <StarRatingInput currentRating={userRating} />
                  </div>
```

- [ ] **Step 8: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Manual verification**

Run: `pnpm dev`, open a published course you're enrolled in. Expected: read-only stars appear near the title; "Your rating" stars appear in the sidebar card. Click a star → toast "Thanks for rating!"; the summary average updates. Reload → your selection persists. Open a course you are NOT enrolled in → no input, summary still shows (or "No ratings yet").

- [ ] **Step 10: Commit**

```bash
git add app/routes/courses.\$slug.tsx app/components/star-rating.tsx
git commit -m "feat: show and submit course ratings on the detail page"
```

---

## Task 7: Wire the catalog list page

**Files:**
- Modify: `app/routes/courses.tsx`

- [ ] **Step 1: Add imports**

In `app/routes/courses.tsx`, after the `getUserEnrolledCourses` import (line 14), add:

```ts
import { getRatingSummariesForCourses } from "~/services/ratingService";
```

And after the `UserAvatar` import (line 11), add:

```ts
import { StarRating } from "~/components/star-rating";
```

- [ ] **Step 2: Batch-load summaries in the loader**

In the `loader`, after `const courses = buildCourseQuery(...)` (line 38), add:

```ts
  const ratingSummaries = getRatingSummariesForCourses(
    courses.map((c) => c.id)
  );
```

Then, in the `coursesWithLessonCount` map (line 58), add a `rating` field to the returned object:

```ts
    return {
      ...course,
      lessonCount: getLessonCountForCourse(course.id),
      progress: userProgress?.progress ?? null,
      completedLessons: userProgress?.completedLessons ?? null,
      pppPrice,
      rating: ratingSummaries.get(course.id) ?? { average: null, count: 0 },
    };
```

- [ ] **Step 3: Render stars in the card**

In the card body, the `CardContent` showing the description (~line 208), add the summary right after the description paragraph's closing `</CardContent>`. Insert a new block after the description `CardContent` (line 212) and before the progress `CardContent`:

```tsx
                <CardContent className="pt-0">
                  <StarRating
                    average={course.rating.average}
                    count={course.rating.count}
                  />
                </CardContent>
```

- [ ] **Step 4: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`, open `/courses`. Expected: each card shows the star summary (or "No ratings yet"). A course you rated in Task 6 shows the matching average.

- [ ] **Step 6: Commit**

```bash
git add app/routes/courses.tsx
git commit -m "feat: show average course rating on the catalog list"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: PASS — all existing tests plus the new `ratingService` tests green.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Confirm the working tree is clean**

Run: `git status`
Expected: nothing to commit (all changes committed across Tasks 1–7).

---

## Self-Review notes

- **Spec coverage:** table+unique index (T1); `submitRating`/`getUserRating` (T2); `getCourseRatingSummary`/`getRatingSummariesForCourses` (T3); read-only + interactive component (T4–T5); detail page summary+input+action with enrollment gating and toasts (T6); list page batch summary (T7); zero-rating "No ratings yet", 1-decimal display, nearest-half fill (T4); editable-upsert + non-enrolled + range rejection tested (T2). All spec sections map to a task.
- **Type consistency:** `RatingSummary = { average: number | null; count: number }` is defined in T3 and consumed identically in T4/T6/T7. `submitRating(userId, courseId, stars)`, `getUserRating → number | null`, and `getRatingSummariesForCourses → Map<number, RatingSummary>` signatures match across tasks.
- **No placeholders:** every code step shows full code and exact commands.
