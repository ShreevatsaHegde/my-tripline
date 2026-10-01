import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  prompt: z.string().trim().min(5).max(2000),
  startDate: z.string().max(20).optional().default(""),
});

export type AiStop = {
  name: string;
  region: string;
  kind: "start" | "end" | "destination" | "hotel" | "break" | "fuel";
  day: number;
  activities: string;
  travel: string;
  lat: number | null;
  lon: number | null;
};
export type AiPlan = { title: string; summary: string; itinerary: string; stops: AiStop[] };

const SYSTEM = `You are a practical road-trip planner. The user describes their trip in free text (e.g. "plan trip from sirsi to gokarna for 2 days"). Extract the start location, end location, number of days and any preferences from their message. If the end is not mentioned, make it a round trip back to the start. If days are not mentioned, choose a realistic number. Return ONLY a JSON object, no markdown, with this shape:
{"title": string, "summary": string (2-3 sentences),
 "itinerary": string (plain-text day-by-day plan: "Day 1: START → A → B → Hotel" lines, each followed by short bullet lines for activities, food/rest breaks, approx distances and travel times),
 "stops": [{"name": string (real searchable place name), "region": string (district/state/country), "kind": "start"|"end"|"destination"|"hotel"|"break"|"fuel", "day": number, "activities": string (short), "travel": string (approx km and time from previous stop), "lat": number, "lon": number}]}
Rules: stops are in travel order. The first stop has kind "start" and the last has kind "end" (even if it is the same place as the start). Real places to visit are "destination". Add a "hotel" stop at the end of each day except the last, and add meal/rest "break" or "fuel" stops where sensible. Keep it realistic for the number of days. Coordinates approximate.`;

export const generateTripPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<AiPlan> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const prompt = [
      `Trip request: ${data.prompt}`,
      data.startDate && `Start date: ${data.startDate}`,
    ]
      .filter(Boolean)
      .join("\n");

    let text: string;
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        system: SYSTEM,
        prompt,
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      text = await result.text;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 429) throw new Error("The AI is busy right now. Please try again in a minute.");
      if (status === 402) throw new Error("AI credits have run out for this workspace.");
      console.error("AI plan failed", e);
      throw new Error("Could not generate a plan. Please try again.");
    }
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The AI did not return a plan. Please try again.");
    const raw = JSON.parse(match[0]) as Partial<AiPlan>;
    const kinds = ["start", "end", "destination", "hotel", "break", "fuel"];
    const stops = (raw.stops ?? [])
      .filter((s) => s && typeof s.name === "string" && s.name.trim())
      .map((s) => ({
        name: String(s.name).slice(0, 200),
        region: String(s.region ?? "").slice(0, 200),
        kind: (kinds.includes(s.kind as string) ? s.kind : "destination") as AiStop["kind"],
        day: Number.isFinite(Number(s.day)) ? Math.max(1, Math.round(Number(s.day))) : 1,
        activities: String(s.activities ?? "").slice(0, 500),
        travel: String(s.travel ?? "").slice(0, 200),
        lat: Number.isFinite(Number(s.lat)) ? Number(s.lat) : null,
        lon: Number.isFinite(Number(s.lon)) ? Number(s.lon) : null,
      }));
    return {
      title: String(raw.title ?? "AI trip").slice(0, 200),
      summary: String(raw.summary ?? "").slice(0, 1000),
      itinerary: String(raw.itinerary ?? "").slice(0, 6000),
      stops,
    };
  });
