import { z } from "zod";
import { notifyOwner } from "./notification";
import { invokeLLM } from "./llm";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  chat: publicProcedure
    .input(
      z.object({
        messages: z.array(z.object({ role: z.string(), content: z.string() })),
        systemPrompt: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const msgs = [
        ...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []),
        ...input.messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];
      const result = await invokeLLM({ messages: msgs });
      const raw = result.choices?.[0]?.message?.content ?? "";
      const content = typeof raw === "string" ? raw : JSON.stringify(raw);
      return { role: "assistant" as const, content };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
