import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { getCurrentProfile } from "@/lib/services/auth.service";
import {
  createCustomerRequest,
  findMatchingProvidersForRequest,
  createRequestNotificationsForProviders,
} from "@/lib/services/requests.service";
import { type CanonicalCategory } from "@/lib/services/categories";
import NavDrawer from "@/components/NavDrawer";

function inferCategory(title: string, description: string): CanonicalCategory {
  const text = `${title} ${description}`.toLowerCase();

  if (
    /hair|haircut|barber|braid|braiding|salon|makeup|make-up|beauty|nail|nails|manicure|pedicure|spa|facial|lashes|wedding makeup/.test(
      text
    )
  ) {
    return "beauty-hair";
  }

  if (
    /laptop|computer|pc|phone|smartphone|software|website|web site|app|application|coding|programming|developer|printer|wifi|wi-fi|internet|network|router|it support|technology|tech|database|server/.test(
      text
    )
  ) {
    return "technology-it";
  }

  if (
    /tutor|tutoring|teacher|teaching|lesson|school|student|education|math|mathematics|english|physics|chemistry|biology|course|training|academic|homework/.test(
      text
    )
  ) {
    return "education";
  }

  if (
    /logo|graphic design|graphics|designer|design|poster|flyer|banner|branding|illustration|photoshop|figma|ui design|ux design|video editing|photography|photo|photographer/.test(
      text
    )
  ) {
    return "creative-design";
  }

  if (
    /plumb|plumber|pipe|pipes|leak|leaking|water|drain|sink|toilet|electric|electrician|wiring|socket|switch|power|generator|carpenter|carpentry|furniture|woodwork|repair|fix|broken|maintenance|mechanic|vehicle|car repair|air conditioning|ac repair|construction|masonry|painting|cleaning/.test(
      text
    )
  ) {
    return "maintenance";
  }

  if (
    /wedding|party|birthday|event|events|ceremony|decoration|decor|catering|dj|mc|entertainment/.test(
      text
    )
  ) {
    return "events";
  }
  if (
    /health|wellness|fitness|personal trainer|nutritionist|blood|bleeding|fracture|surgery|yoga|massage|therapy|counseling|psychologist|doctor|medical/.test(
      text
    )
  ) {
    return "health-wellness";
  }

  return "other";
}

export default function PostRequestForm() {
  const router = useRouter();
  const [result, setResult] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (submitting) return;

    const form = event.currentTarget;

    setSubmitting(true);
    setResult("Posting your request...");

    try {
      const profile = await getCurrentProfile();

      if (!profile) {
        setResult("You must be signed in to post a request.");
        return;
      }

      const formData = new FormData(form);

      const title = String(
        formData.get("title") || ""
      ).trim();

      const description = String(
        formData.get("description") || ""
      ).trim();

      const location = String(
        formData.get("location") || ""
      ).trim();

      const budgetRaw = String(
        formData.get("budget_max") || ""
      ).trim();

      const budgetMax =
        budgetRaw !== "" &&
        Number.isFinite(Number(budgetRaw))
          ? Number(budgetRaw)
          : null;

      if (!title || !description) {
        setResult(
          "Please provide a title and description for your request."
        );
        return;
      }

      /*
       * NINJAWO determines the category from what
       * the customer describes instead of forcing
       * the customer to understand service categories.
       */
      const category = inferCategory(
        title,
        description
      );

      console.log("Detected request category:", category);

      const createdRequest =
        await createCustomerRequest({
          customer_id: profile.id,
          category,
          title,
          description,
          location: location || undefined,
          budget_max: budgetMax,
        });

      if (!createdRequest) {
        setResult(
          "We could not post your request. Please try again."
        );
        return;
      }

      const providers =
        await findMatchingProvidersForRequest(
          location,
          category
        );

      const notifications =
        await createRequestNotificationsForProviders(
          createdRequest.id,
          providers.map(
            (provider) => provider.id
          ),
          createdRequest.title,
          "/provider/requests"
        );

      form.reset();

      setResult(
        notifications.length > 0
          ? `Your request was posted successfully. ${notifications.length} matching provider${
              notifications.length === 1
                ? ""
                : "s"
            } in your area ${
              notifications.length === 1
                ? "has"
                : "have"
            } been notified.`
          : "Your request was posted successfully. We'll notify matching providers as they become available."
      );
    } catch (error) {
      console.error("Error posting request:", error);

      setResult(
        error instanceof Error
          ? error.message
          : "Failed to post your request."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="request-form-page">
      <div className="mb-4">
        <NavDrawer />
      </div>
      <div className="request-form-card">
        <h1 className="request-form-title">
          Post a service request
        </h1>

        <p className="request-form-intro">
          Tell us what you need help with. NINJAWO will
          identify the type of service and find skilled
          ninjas in your area.
        </p>

        <form
          className="request-form"
          onSubmit={onSubmit}
        >
          <label htmlFor="title">
            What do you need help with?
          </label>

          <input
            id="title"
            name="title"
            required
            placeholder="e.g. My laptop won't turn on"
          />

          <label htmlFor="description">
            Describe your problem
          </label>

          <textarea
            id="description"
            name="description"
            rows={6}
            required
            placeholder="Tell your ninja what is wrong and what you need done..."
          />

          <label htmlFor="location">
            Location
          </label>

          <input
            id="location"
            name="location"
            placeholder="e.g. Kampala, Ntinda"
          />

          <label htmlFor="budget_max">
            Maximum budget (optional)
          </label>

          <input
            id="budget_max"
            name="budget_max"
            type="number"
            min="0"
            placeholder="UGX"
          />

          <button
            className="request-form-submit"
            disabled={submitting}
            type="submit"
          >
            {submitting
              ? "Posting..."
              : "Post Request"}
          </button>
        </form>

        <p
          className="request-form-status"
          aria-live="polite"
        >
          {result}
        </p>
      </div>
    </div>
  );
}