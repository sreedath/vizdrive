// Community garage: shared, permanent agent storage (Supabase PostgREST).
//
// Anyone with the site link can upload a trained policy.json and everyone
// sees it in the lobby. The anon key below is a PUBLIC client credential
// by design; row-level security on the table allows INSERT and SELECT
// only, so uploads cannot be modified or deleted from the browser.

const GARAGE_URL =
  "https://jsvpzyzodtannbnmkfsl.supabase.co/rest/v1/vizdrive_agents";
const GARAGE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzdnB6eXpvZHRhbm5ibm1rZnNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzI2NTEsImV4cCI6MjA4NjkwODY1MX0.7D4jtsDWbd1RsiV1rj1G3kP1-5_dIEBwaGDNP606nlU";

const HEADERS = {
  apikey: GARAGE_KEY,
  Authorization: `Bearer ${GARAGE_KEY}`,
};

// Newest first. Light query: the (large) policy JSON is NOT included.
export async function garageList(limit = 200) {
  const res = await fetch(
    `${GARAGE_URL}?select=id,name,created_at&order=created_at.desc` +
      `&limit=${limit}`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`garage list failed (${res.status})`);
  return res.json();
}

export async function garageFetch(id) {
  const res = await fetch(
    `${GARAGE_URL}?id=eq.${encodeURIComponent(id)}&select=policy`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`garage download failed (${res.status})`);
  const rows = await res.json();
  if (!rows.length) throw new Error("agent not found in the garage");
  return rows[0].policy;
}

export async function garageUpload(name, policy) {
  const res = await fetch(GARAGE_URL, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ name, policy }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`upload failed (${res.status}) ${detail.slice(0, 120)}`);
  }
  return (await res.json())[0];
}
