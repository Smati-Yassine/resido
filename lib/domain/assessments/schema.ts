/** FIXED: the lot's annual charge, snapshotted when the cycle opens or the lot joins it. */
export const ASSESSMENT_CALCULATION_METHODS = ["FIXED", "MANUAL"] as const;
export type AssessmentCalculationMethod = (typeof ASSESSMENT_CALCULATION_METHODS)[number];

export const ASSESSMENT_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export interface Assessment {
  id: string;
  organizationId: string;
  cycleId: string;
  lotId: string;
  amountMillimes: number;
  calculationMethod: AssessmentCalculationMethod;
  calculationInputs?: Record<string, unknown>;
  dueDate: Date;
  status: AssessmentStatus;
  paidMillimes: number;
  notes?: string;
}
