import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppUpdateChecker } from "../src/components/app-update-checker";
import { GET } from "../src/app/api/version/route";

const { effect } = vi.hoisted(() => ({ effect: vi.fn() }));
vi.mock("react", () => ({ useEffect: effect }));
let cleanup: (() => void) | undefined;
let visibility: string;
let page: EventTarget;
let browser: EventTarget;
const request = vi.fn();
const confirm = vi.fn();
const reload = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "current");
  visibility = "visible";
  page = new EventTarget();
  Object.defineProperty(page, "visibilityState", { get: () => visibility });
  browser = Object.assign(new EventTarget(), {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    confirm,
    location: { reload },
  });
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", browser);
  vi.stubGlobal("fetch", request);
  request.mockResolvedValue(Response.json({ version: "current" }));
  confirm.mockReturnValue(false);
  effect.mockImplementation((callback: () => (() => void) | undefined) => {
    cleanup = callback();
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
});

it("serves the build version without caching", async () => {
  const response = GET();
  expect(await response.json()).toEqual({ version: "current" });
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("checks only on entry and preserves the page when declined", async () => {
  request.mockImplementation(async () => Response.json({ version: "new" }));
  AppUpdateChecker();
  await vi.advanceTimersByTimeAsync(0);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(reload).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(confirm).toHaveBeenCalledTimes(1);
  request.mockImplementation(async () => Response.json({ version: "newer" }));
  page.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
});

it("reloads only when the user accepts", async () => {
  request.mockResolvedValue(Response.json({ version: "new" }));
  confirm.mockReturnValue(true);
  AppUpdateChecker();
  await vi.advanceTimersByTimeAsync(0);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(
    "/api/version",
    expect.objectContaining({ cache: "no-store" }),
  );
});

it("does not check again on tab return or reconnect", async () => {
  AppUpdateChecker();
  await vi.advanceTimersByTimeAsync(0);
  visibility = "hidden";
  page.dispatchEvent(new Event("visibilitychange"));
  visibility = "visible";
  page.dispatchEvent(new Event("visibilitychange"));
  browser.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(120_000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
});

it.each(["offline", "error", "invalid"])(
  "ignores %s without retrying",
  async (failure) => {
    if (failure === "offline")
      request.mockRejectedValueOnce(new Error("offline"));
    else
      request.mockResolvedValueOnce(
        failure === "error"
          ? new Response("unavailable", { status: 503 })
          : Response.json({ version: 123 }),
      );
    AppUpdateChecker();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(confirm).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  },
);

it("aborts a pending check when unmounted", async () => {
  let resolve!: (response: Response) => void;
  request.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  AppUpdateChecker();
  const signal = request.mock.calls[0][1].signal as AbortSignal;
  cleanup?.();
  cleanup = undefined;
  expect(signal.aborted).toBe(true);
  resolve(Response.json({ version: "new" }));
  page.dispatchEvent(new Event("visibilitychange"));
  browser.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
});
