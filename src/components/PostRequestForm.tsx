import { useState } from "react";
import { getCurrentProfile } from "@/lib/services/auth.service";
import {
  createCustomerRequest,
  findMatchingProvidersForRequest,
  createRequestNotificationsForProviders,
} from "@/lib/services/requests.service";

export default function PostRequestForm() {
  const [result, setResult] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setResult("Posting your request...");

    try {
      const profile = await getCurrentProfile();
      if (!profile) {
        setResult("You must be signed in to post a request.");
        return;
      }

      const formData = new FormData(event.currentTarget);
      const location = String(formData.get("location") || "").trim();
      const createdRequest = await createCustomerRequest({
        customer_id: profile.id,
        title: String(formData.get("title") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        location: location || undefined,
        budget_max: formData.get("budget_max")
          ? Number(formData.get("budget_max"))
          : null,
      });

      if (!createdRequest) {
        setResult("We could not post your request. Please try again.");
        return;
      }

      const providers = await findMatchingProvidersForRequest(location);
      const notifications = await createRequestNotificationsForProviders(
        createdRequest.id,
        providers.map((provider) => provider.id),
        createdRequest.title,
        "/provider/requests"
      );

      event.currentTarget.reset();
      setResult(
        notifications.length > 0
          ? `Your request was posted successfully. ${notifications.length} matching provider${notifications.length === 1 ? "" : "s"} in your area ${notifications.length === 1 ? "has" : "have"} been notified.`
          : "Your request was posted successfully. We'll notify providers in your area as they become available."
      );
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Failed to post your request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="request-form-page">
      <div className="request-form-card">
        <h1 className="request-form-title">Post a service request</h1>
        <p className="request-form-intro">Describe the service you need; providers in your area will be able to see and respond.</p>

        <form className="request-form" onSubmit={onSubmit}>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" required />

          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={6} required />

          <label htmlFor="location">Location (optional)</label>
          <input id="location" name="location" />

          <label htmlFor="budget_max">Budget max (optional)</label>
          <input id="budget_max" name="budget_max" type="number" />

          <button className="request-form-submit" disabled={submitting} type="submit">{submitting ? "Posting..." : "Post Request"}</button>
        </form>

        <p className="request-form-status" aria-live="polite">{result}</p>
      </div>
    </div>
  );
}
