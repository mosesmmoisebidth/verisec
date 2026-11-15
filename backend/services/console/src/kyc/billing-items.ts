import { toMicro, type UsageItem } from './credits.service';
import type { RecordSections } from './records.service';
import { CHECKS, priceRange, type WorkflowDefinition } from './workflows';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Whether a check ran, read from what it left in the record (a check that left nothing is never charged). */
const RAN: Record<string, (d: RecordSections) => boolean> = {
  document: (d) => !!d.document || !!d.identity,
  // read in the same pass as the document
  authenticity: (d) => !!d.document,
  // worked out from the document's date of birth
  age: (d) => !!d.identity || !!d.document,
  nfc: (d) => !!(d.document as any)?.nfc,
  liveness: (d) => !!(d.face as any)?.liveness,
  'face-match': (d) => !!(d.face as any)?.match,
  'face-search': (d) => !!(d.face as any)?.search,
  'face-attributes': (d) => !!(d.face as any)?.attributes,
  email: (d) => !!(d.contact as any)?.email,
  phone: (d) => !!(d.contact as any)?.phone,
  aml: (d) => !!d.screening,
  'device-ip': (d) => !!d.device,
  address: (d) => !!d.address,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The most a verification on this workflow can cost (rules may add checks), which is what is held for it. */
export const holdFor = (d: WorkflowDefinition) => toMicro(priceRange(d).max);

/**
 * The checks of this workflow that ran in this verification, each at its list price. Only checks the workflow
 * holds (or a rule of it may add) count; the server refuses any other check during the flow anyway.
 */
export function checksRan(
  d: WorkflowDefinition,
  data: RecordSections,
): UsageItem[] {
  const planned = new Set<string>([
    ...d.checks.map((c) => c.id),
    ...d.rules
      .filter((r) => r.then === 'require' && r.check)
      .map((r) => r.check!),
  ]);
  return CHECKS.filter(
    (c) => planned.has(c.id) && c.price > 0 && RAN[c.id]?.(data),
  ).map((c) => ({
    product: 'kyc',
    item: c.id,
    label: c.name,
    amount: toMicro(c.price),
  }));
}
