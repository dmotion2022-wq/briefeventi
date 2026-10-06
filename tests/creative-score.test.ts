import { describe, expect, it } from "vitest";
import { rubricFrom, seededShuffle, weightedScoreBp } from "@/domain/creative/score";

describe("punteggi della commissione", () => {
  const rubric = [
    { criterion: "Qualità del progetto", weight: 60 },
    { criterion: "Originalità", weight: 40 },
  ];

  it("media pesata in punti base", () => {
    // (8×60 + 6×40) / 100 = 7,2 → 7200
    expect(weightedScoreBp([{ criterion: "Qualità del progetto", score: 8 }, { criterion: "Originalità", score: 6 }], rubric)).toBe(7200);
  });

  it("ignora criteri inventati e limita i voti fra 1 e 10", () => {
    expect(
      weightedScoreBp(
        [
          { criterion: "Qualità del progetto", score: 14 },
          { criterion: "Criterio che non esiste", score: 1 },
        ],
        rubric,
      ),
    ).toBe(10000);
  });

  it("usa i criteri della gara, con o senza pesi", () => {
    expect(rubricFrom([{ criterion: "Proposta tecnica", weight: 70 }, { criterion: "Prezzo", weight: 30 }], rubric)).toEqual([
      { criterion: "Proposta tecnica", weight: 70 },
      { criterion: "Prezzo", weight: 30 },
    ]);
    expect(rubricFrom([{ criterion: "A", weight: null }, { criterion: "B", weight: null }], rubric)).toEqual([
      { criterion: "A", weight: 1 },
      { criterion: "B", weight: 1 },
    ]);
    expect(rubricFrom([], rubric)).toBe(rubric);
  });

  it("mescola in modo riproducibile", () => {
    const a = seededShuffle(["safe", "bold", "disruptive"], "run_1");
    expect(seededShuffle(["safe", "bold", "disruptive"], "run_1")).toEqual(a);
    expect([...a].sort()).toEqual(["bold", "disruptive", "safe"]);
  });
});
