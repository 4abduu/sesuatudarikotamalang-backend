/**
 * Midtrans transaction statuses that count as a successful online payment.
 * Keep this predicate shared by the webhook and refund policy.
 */
export function isPaymentSuccess(status?: string | null, fraudStatus?: string | null): boolean {
  return status === "settlement" || (status === "capture" && fraudStatus === "accept");
}
