import { ulid } from "ulid";

// ID testuali con prefisso leggibile (prj_…, qln_…): ordinabili nel tempo e portabili su Postgres.
export const newId = (prefix: string) => `${prefix}_${ulid().toLowerCase()}`;
