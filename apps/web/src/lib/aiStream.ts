/**
 * Reading an AI text stream from the API (P7).
 *
 * The endpoints answer with server-sent events, but they are POSTs carrying a JSON body,
 * which `EventSource` cannot send — so this reads the response body directly and parses
 * the `data:` frames itself.
 *
 * Wire format (see `routes/ai.ts`):
 *   data: {"delta":"part of the answer"}
 *   ...
 *   data: {"done":true,"text":"the whole answer","cached":false,"artifactId":"…"}
 * or, on failure part-way:
 *   data: {"error":"why it stopped"}
 */
import { ApiError } from "./subjectsApi";

export interface StreamResult {
  /** The complete text once the stream finishes. */
  text: string;
  /** True when this came from `ai_artifacts` rather than a fresh model call. */
  cached: boolean;
  artifactId: string | null;
}

/**
 * POST `path` with `body`, calling `onDelta` with the whole text assembled so far after
 * every frame. Pass `signal` to be able to stop mid-answer.
 */
export async function streamAi(
  path: string,
  body: Record<string, unknown>,
  onDelta: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) throw new ApiError("AI request failed", res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let failure: string | null = null;
  let outcome: StreamResult | null = null;

  const consume = (block: string) => {
    const payload = block
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6))
      .join("\n");
    if (!payload) return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return; // a torn frame at the end of a response is not worth failing over
    }

    if (typeof event.error === "string") {
      failure = event.error;
      return;
    }
    if (typeof event.delta === "string") {
      text += event.delta;
      onDelta(text);
      return;
    }
    if (event.done === true) {
      outcome = {
        text: typeof event.text === "string" ? event.text : text,
        cached: event.cached === true,
        artifactId: typeof event.artifactId === "string" ? event.artifactId : null,
      };
    }
  };

  for (;;) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      consume(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");
    }
  }

  // A trailing frame without its blank line still counts — some buffers split there.
  if (buffer.trim()) consume(buffer);

  if (failure) throw new ApiError(failure, 502);
  if (!outcome) throw new ApiError("The stream ended without a result.", 502);
  return outcome;
}
