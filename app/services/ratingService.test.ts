import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
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

    it("rejects a fractional star value", () => {
      enroll(base.user.id, base.course.id);
      expect(() =>
        submitRating(base.user.id, base.course.id, 4.5)
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
