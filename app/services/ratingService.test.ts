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
import {
  submitRating,
  getUserRating,
  getCourseRatingSummary,
  getRatingSummariesForCourses,
} from "./ratingService";

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

    it("omits courses that have no ratings", () => {
      const course2 = makeCourse("course-no-ratings");

      enroll(base.user.id, base.course.id);
      submitRating(base.user.id, base.course.id, 4);

      const map = getRatingSummariesForCourses([base.course.id, course2.id]);

      expect(map.has(base.course.id)).toBe(true);
      expect(map.has(course2.id)).toBe(false);
    });

    it("returns an empty map for an empty id list", () => {
      const map = getRatingSummariesForCourses([]);
      expect(map.size).toBe(0);
    });
  });
});
