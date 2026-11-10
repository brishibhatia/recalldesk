import { describe, expect, it } from "vitest";
import { readCheckError } from "../scripts/lib/read-check-error";

describe("read-only provider error projection", () => {
  it("distinguishes rejected credentials from unavailable auth infrastructure", () => {
    expect(readCheckError({ status: 401 }, "walrus_recall").code).toBe(
      "AUTH_REJECTED",
    );
    expect(
      readCheckError(
        { status: 503, serverCode: "AUTH_UPSTREAM_UNAVAILABLE" },
        "walrus_recall",
      ).code,
    ).toBe("AUTH_UPSTREAM_UNAVAILABLE");
    expect(
      readCheckError(
        { status: 401, serverCode: "ERR_TIMESTAMP_OUT_OF_BOUNDS" },
        "walrus_recall",
      ).code,
    ).toBe("CLOCK_DRIFT");
  });

  it("reports bounded preflight timeouts and SDK incompatibility", () => {
    expect(
      readCheckError(
        {
          name: "MemWalRequestTimeout",
          status: 504,
          phase: "preflight GET /config",
        },
        "walrus_recall",
      ),
    ).toMatchObject({
      code: "TIMEOUT",
      phase: "preflight GET /config",
      stage: "walrus_recall",
    });
    expect(
      readCheckError({ name: "MemWalCompatibilityError" }, "walrus_recall")
        .code,
    ).toBe("SDK_COMPATIBILITY");
    expect(
      readCheckError({ code: "RESOURCE_EXHAUSTED" }, "tatum_service").code,
    ).toBe("RATE_LIMITED");
  });

  it("never serializes provider messages, causes or arbitrary code fields", () => {
    const secret = "private-provider-payload";
    const result = readCheckError(
      {
        message: secret,
        cause: secret,
        code: secret,
        serverCode: secret,
        phase: secret,
        status: 500,
      },
      "walrus_recall",
    );
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result).toMatchObject({ code: "PROVIDER_UNAVAILABLE", phase: null });
  });
});
