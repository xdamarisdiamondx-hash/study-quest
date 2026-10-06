/**
 * Home's due-cards row (P9): the count the plan's box asks for, and the
 * quickest way to clear it — "review 20 now" straight from the dashboard.
 *
 * Silent by design: a student with no cards yet, or none due today, gets no
 * card at all rather than a zero shouting from Home. Once cards exist, the row
 * always answers "what is waiting for me?" — due now, hard to remember, and
 * one press to start the queue on the shared theatre. The queue itself is a
 * snapshot taken at that press (useStudyQueue), so the session's own submit
 * can refresh every count around it without moving the cards under it.
 */
import { useState } from "react";
import { Button, Card } from "@sq/ui";

import { useCardsSummary, useStudyQueue, useSubmitReviews } from "../../lib/useFlashcards";
import { CardStudy } from "./CardStudy";

const REVIEW_NOW = 20;

export function DueReviewCard() {
  const summary = useCardsSummary();
  const [request, setRequest] = useState<{ n: number } | null>(null);
  const queue = useStudyQueue(request ? { scope: { limit: REVIEW_NOW }, n: request.n } : null);
  const submit = useSubmitReviews();
  const cards = queue.data?.cards ?? null;

  if (summary.isLoading || summary.error) return null;

  const due = summary.data?.due ?? 0;
  const hard = summary.data?.hard ?? 0;
  const hasCards = (summary.data?.coverage ?? []).some((c) => c.total > 0);
  if (!hasCards) return null;

  const nothingDue = Boolean(request) && cards !== null && cards.length === 0 && !queue.isFetching;

  return (
    <>
      {request && cards && cards.length > 0 && (
        <CardStudy
          key={request.n}
          title="Due cards"
          cards={cards}
          submit={(body) => submit.mutateAsync(body)}
          onExit={() => setRequest(null)}
        />
      )}

      <Card title="Flashcards">
        <div className="sq-row" style={{ gap: "var(--s4)", flexWrap: "nowrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {due > 0 ? (
              <>
                <div style={{ fontWeight: 500 }}>
                  {due} card{due === 1 ? "" : "s"} due
                  {hard > 0 && (
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {hard} hard</span>
                  )}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>
                  A short round now keeps the intervals small.
                </div>
              </>
            ) : (
              <div style={{ fontWeight: 500, color: "var(--muted)" }}>
                All caught up — no cards due today.
              </div>
            )}
          </div>
          {due > 0 && (
            <Button size="sm" onClick={() => setRequest((prev) => ({ n: (prev?.n ?? 0) + 1 }))}>
              Review {Math.min(due, REVIEW_NOW)} now
            </Button>
          )}
        </div>
        {request && queue.error ? (
          <div className="sq-error" role="alert" style={{ marginTop: "var(--s2)" }}>
            {queue.error.message}
          </div>
        ) : null}
        {request && queue.isLoading && !cards ? (
          <p className="sq-help" style={{ margin: "var(--s2) 0 0" }}>
            Loading cards…
          </p>
        ) : null}
        {nothingDue ? (
          <p className="sq-help" style={{ margin: "var(--s2) 0 0" }}>
            Nothing is due right now.
          </p>
        ) : null}
      </Card>
    </>
  );
}
