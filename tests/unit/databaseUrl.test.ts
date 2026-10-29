import { describe, expect, it } from "vitest";

import {
  DEFAULT_DATABASE_URL,
  drizzleKitDatabaseUrl,
  expandDatabaseUrl,
} from "../../src/db/databaseUrl.js";

describe("expandDatabaseUrl", () => {
  it("replaces every ${NAME} from the supplied environment", () => {
    const url = expandDatabaseUrl(
      "postgresql://app:${DATABASE_PASSWORD}@db:5432/${DATABASE_NAME}",
      { DATABASE_PASSWORD: "s3cret", DATABASE_NAME: "app" },
    );
    expect(url).toBe("postgresql://app:s3cret@db:5432/app");
  });

  it("keeps an empty referenced value", () => {
    expect(expandDatabaseUrl("file:${DATA_DIR}/db", { DATA_DIR: "" })).toBe(
      "file:/db",
    );
  });

  it("throws when a referenced variable is unset", () => {
    expect(() =>
      expandDatabaseUrl("postgresql://app:${DATABASE_PASSWORD}@db:5432/app", {}),
    ).toThrow(/DATABASE_PASSWORD/);
  });
});

describe("drizzleKitDatabaseUrl", () => {
  it("expands references before Drizzle Kit opens the database", () => {
    expect(
      drizzleKitDatabaseUrl(
        "postgresql://app:${DATABASE_PASSWORD}@db:5432/app",
        { DATABASE_PASSWORD: "s3cret" },
      ),
    ).toBe("postgresql://app:s3cret@db:5432/app");
  });

  it("uses the on-disk default for an in-memory URL", () => {
    expect(drizzleKitDatabaseUrl("memory://")).toBe(DEFAULT_DATABASE_URL);
  });
});
