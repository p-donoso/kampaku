import { describe, it, expect, vi } from "vitest";
import {
  createJobControl,
  assertJobContinuing,
  JobPausedError,
  JobCancelledError,
  type JobControl,
} from "../src/job-runner/control.js";

describe("job control", () => {
  describe("createJobControl", () => {
    it("returns continue when fetchStatus returns null", async () => {
      const fetchStatus = vi.fn().mockResolvedValue(null);
      const control = createJobControl(fetchStatus);
      
      const signal = await control.check();
      expect(signal).toBe("continue");
    });

    it("returns continue when job status is running", async () => {
      const fetchStatus = vi.fn().mockResolvedValue({ status: "running" });
      const control = createJobControl(fetchStatus);
      
      const signal = await control.check();
      expect(signal).toBe("continue");
    });

    it("returns pause when job status is paused", async () => {
      const fetchStatus = vi.fn().mockResolvedValue({ status: "paused" });
      const control = createJobControl(fetchStatus);
      
      const signal = await control.check();
      expect(signal).toBe("pause");
    });

    it("returns cancel when job status is cancelled", async () => {
      const fetchStatus = vi.fn().mockResolvedValue({ status: "cancelled" });
      const control = createJobControl(fetchStatus);
      
      const signal = await control.check();
      expect(signal).toBe("cancel");
    });

    it("handles other job statuses as continue", async () => {
      const fetchStatus = vi.fn().mockResolvedValue({ status: "queued" });
      const control = createJobControl(fetchStatus);
      
      const signal = await control.check();
      expect(signal).toBe("continue");
    });
  });

  describe("assertJobContinuing", () => {
    it("does nothing when control is undefined", async () => {
      await expect(assertJobContinuing(undefined)).resolves.toBeUndefined();
    });

    it("does nothing when job should continue", async () => {
      const fetchStatus = vi.fn().mockResolvedValue({ status: "running" });
      const control = createJobControl(fetchStatus);
      
      await expect(assertJobContinuing(control)).resolves.toBeUndefined();
    });

    it("throws JobPausedError when job is paused", async () => {
      const fetchStatus = vi.fn().mockResolvedValue({ status: "paused" });
      const control = createJobControl(fetchStatus);
      
      await expect(assertJobContinuing(control)).rejects.toThrow(JobPausedError);
      await expect(assertJobContinuing(control)).rejects.toThrow("Job paused.");
    });

    it("throws JobCancelledError when job is cancelled", async () => {
      const fetchStatus = vi.fn().mockResolvedValue({ status: "cancelled" });
      const control = createJobControl(fetchStatus);
      
      await expect(assertJobContinuing(control)).rejects.toThrow(JobCancelledError);
      await expect(assertJobContinuing(control)).rejects.toThrow("Job cancelled.");
    });
  });

  describe("error types", () => {
    it("JobPausedError has correct name and message", () => {
      const error = new JobPausedError();
      expect(error.name).toBe("JobPausedError");
      expect(error.message).toBe("Job paused.");
      expect(error).toBeInstanceOf(Error);
    });

    it("JobCancelledError has correct name and message", () => {
      const error = new JobCancelledError();
      expect(error.name).toBe("JobCancelledError");
      expect(error.message).toBe("Job cancelled.");
      expect(error).toBeInstanceOf(Error);
    });
  });
});
