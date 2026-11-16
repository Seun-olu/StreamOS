import { describe, expect, test } from "vitest";
import { formatRuntime, genreRows, isFinished, progressPercent, resumePosition, safeNext, slugify, totalRuntime } from "./catalog";

describe("catalog helpers", () => {
  test("slugify", () => {
    expect(slugify("  Tears of Steel! ")).toBe("tears-of-steel");
    expect(slugify("Amélie (2001)")).toBe("amelie-2001");
    expect(slugify("---")).toBe("");
  });

  test("formatRuntime", () => {
    expect(formatRuntime(888)).toBe("15m");
    expect(formatRuntime(5400)).toBe("1h 30m");
    expect(formatRuntime(20)).toBe("1m");
    expect(formatRuntime(null)).toBe("");
  });

  test("resume position restarts when barely started or nearly finished", () => {
    expect(resumePosition(3, 600)).toBe(0);
    expect(resumePosition(120.7, 600)).toBe(120);
    expect(resumePosition(590, 600)).toBe(0);
    expect(resumePosition(NaN, 600)).toBe(0);
    expect(resumePosition(300, null)).toBe(300);
    expect(isFinished(590, 600)).toBe(true);
    expect(isFinished(100, 600)).toBe(false);
    expect(resumePosition(8, 20)).toBe(8); // short clips resume too
    expect(isFinished(19.5, 20)).toBe(true);
    expect(progressPercent(150, 600)).toBe(25);
    expect(progressPercent(700, 600)).toBe(100);
  });

  test("total runtime sums episodes", () => {
    const v = (d: number) => ({ url: "", duration_s: d, license: "", license_url: null, attribution: "", source_url: "" });
    expect(totalRuntime({ kind: "movie", video: v(600), episodes: [] })).toBe(600);
    expect(totalRuntime({ kind: "series", video: null, episodes: [{ id: "1", season: 1, number: 1, name: "", synopsis: "", video: v(60) }, { id: "2", season: 1, number: 2, name: "", synopsis: "", video: null }] })).toBe(60);
  });

  test("genre rows keep popular genres, most titles first", () => {
    const rows = genreRows([{ genres: ["A", "B"] }, { genres: ["A"] }, { genres: ["C", "B"] }, { genres: ["A"] }]);
    expect(rows.map((r) => [r.genre, r.items.length])).toEqual([["A", 3], ["B", 2]]);
  });

  test("safeNext blocks open redirects", () => {
    expect(safeNext("/watch/sintel?e=1")).toBe("/watch/sintel?e=1");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
