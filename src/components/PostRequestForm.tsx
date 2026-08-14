import { useState } from "react";

export default function PostRequestForm() {
  const [result, setResult] = useState("");

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult("This request flow is handled by Supabase. Web3Forms is no longer used.");
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", padding: 20, borderRadius: 8, border: "1px solid #e6e9ef" }}>
        <h1>Post a customer request</h1>
        <p>Describe the service you need; providers in your area will be able to see and respond.</p>

        <form onSubmit={onSubmit}>
          <label style={{ display: "block", marginTop: 12, fontWeight: 600 }} htmlFor="title">Title</label>
          <input id="title" name="title" required style={{ width: "100%", padding: 8, marginTop: 6, borderRadius: 6, border: "1px solid #d7dbe6" }} />

          <label style={{ display: "block", marginTop: 12, fontWeight: 600 }} htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={6} required style={{ width: "100%", padding: 8, marginTop: 6, borderRadius: 6, border: "1px solid #d7dbe6" }} />

          <label style={{ display: "block", marginTop: 12, fontWeight: 600 }} htmlFor="location">Location (optional)</label>
          <input id="location" name="location" style={{ width: "100%", padding: 8, marginTop: 6, borderRadius: 6, border: "1px solid #d7dbe6" }} />

          <label style={{ display: "block", marginTop: 12, fontWeight: 600 }} htmlFor="budget_max">Budget max (optional)</label>
          <input id="budget_max" name="budget_max" type="number" style={{ width: "100%", padding: 8, marginTop: 6, borderRadius: 6, border: "1px solid #d7dbe6" }} />

          <button type="submit" style={{ marginTop: 14, padding: "10px 14px", background: "#003d9b", color: "#fff", borderRadius: 6, border: "none" }}>Post Request</button>
        </form>

        <p aria-live="polite" style={{ marginTop: 12, color: "#334" }}>{result}</p>
      </div>
    </div>
  );
}
