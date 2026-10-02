import { Card, Monogram, Track } from "@sq/ui";

import { subjects } from "../../data/mock";

export function StudyPage() {
  return (
    <div className="sq-col" style={{ marginTop: "var(--s6)" }}>
      <div>
        <h1
          style={{
            font: "var(--t-h1)",
            margin: "0 0 var(--s1)",
            color: "var(--strong)",
            letterSpacing: "-.025em",
          }}
        >
          Study
        </h1>
        <p style={{ margin: 0, color: "var(--muted)", font: "var(--t-body-sm)" }}>
          Subjects, topics, notes, quizzes and flashcards
        </p>
      </div>

      {subjects.map((subject) => (
        <Card key={subject.id}>
          <div className="sq-row" style={{ flexWrap: "nowrap", gap: "var(--s4)" }}>
            <Monogram text={subject.monogram} active />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Track
                label={subject.name}
                value={subject.progress}
                caption={`${subject.progress}%`}
              />
              <div className="sq-row" style={{ marginTop: "var(--s3)", gap: "var(--s2)" }}>
                {subject.topics.map((topic) => (
                  <span key={topic.name} className="sq-chip" style={{ fontSize: 12 }}>
                    {topic.name} · {topic.progress}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ))}

      <Card>
        <p>
          Subjects and topics become editable in P4. Notes arrive in P5, quizzes in P8, flashcards
          in P9.
        </p>
      </Card>
    </div>
  );
}
