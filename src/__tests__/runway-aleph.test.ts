import { KieAiClient } from "../kie-ai-client.js";
import { RunwayAlephVideoSchema } from "../types.js";

// Aleph moved to Kie's Market API. These tests pin the exact wire format so a
// regression to the old /aleph/generate endpoint or camelCase body is caught.

type Captured = { url: string; method: string; body: any };

function mockFetch(captured: Captured[]) {
  (globalThis as any).fetch = async (url: string, opts: any) => {
    captured.push({
      url: String(url),
      method: opts?.method,
      body: opts?.body ? JSON.parse(opts.body) : undefined,
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: "success", data: { taskId: "t-123" } }),
    };
  };
}

function makeClient() {
  return new KieAiClient({
    apiKey: "test-key",
    baseUrl: "https://api.kie.ai/api/v1",
    timeout: 5000,
  } as any);
}

describe("runway_aleph_video → Market API", () => {
  const realFetch = (globalThis as any).fetch;
  afterEach(() => {
    (globalThis as any).fetch = realFetch;
  });

  it("posts to jobs/createTask with model runway/gen4-aleph and snake_case input", async () => {
    const captured: Captured[] = [];
    mockFetch(captured);

    const request = RunwayAlephVideoSchema.parse({
      prompt: "Fill the grey areas",
      videoUrl: "https://example.com/in.mp4",
      aspectRatio: "9:16",
      seed: 42,
      referenceImage: "https://example.com/ref.jpg",
      waterMark: "wm",
      uploadCn: true,
      callBackUrl: "https://example.com/cb",
    });
    const res = await makeClient().generateRunwayAlephVideo(request);

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(captured[0].method).toBe("POST");
    expect(captured[0].body).toEqual({
      model: "runway/gen4-aleph",
      callBackUrl: "https://example.com/cb",
      input: {
        prompt: "Fill the grey areas",
        video_url: "https://example.com/in.mp4",
        aspect_ratio: "9:16",
        upload_cn: true,
        watermark: "wm",
        seed: 42,
        reference_image: "https://example.com/ref.jpg",
      },
    });
    expect(res.data?.taskId).toBe("t-123");
  });

  it("omits optional fields and sends no camelCase keys", async () => {
    const captured: Captured[] = [];
    mockFetch(captured);

    const request = RunwayAlephVideoSchema.parse({
      prompt: "p",
      videoUrl: "https://example.com/in.mp4",
    });
    await makeClient().generateRunwayAlephVideo(request);

    const body = captured[0].body;
    expect(body.input).toEqual({
      prompt: "p",
      video_url: "https://example.com/in.mp4",
      aspect_ratio: "16:9",
      upload_cn: false,
    });
    const flat = JSON.stringify(body);
    for (const legacy of ["videoUrl", "aspectRatio", "referenceImage", "waterMark", "uploadCn"]) {
      expect(flat).not.toContain(legacy);
    }
  });

  it("polls Aleph tasks through jobs/recordInfo, not the old aleph route", async () => {
    const captured: Captured[] = [];
    mockFetch(captured);

    await makeClient().getTaskStatus("t-123", "runway-aleph-video");

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe(
      "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=t-123",
    );
    expect(captured[0].method).toBe("GET");
  });
});
