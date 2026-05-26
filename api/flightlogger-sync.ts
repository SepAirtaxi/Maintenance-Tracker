// Serverless proxy for Flightlogger TTAF sync.
//
// Lives on Vercel's Edge runtime — runs server-side, never ships to the
// browser. The Flightlogger API token is read from `FLIGHTLOGGER_TOKEN`
// (configured in Vercel env vars) and never leaves the server. The browser
// hits `/api/flightlogger-sync` and gets back a fixed-shape JSON payload;
// the GraphQL query is hardcoded here so this endpoint can only ever return
// per-aircraft TTAF — no arbitrary Flightlogger data access.

export const config = { runtime: "edge" };

const FLIGHTLOGGER_GRAPHQL_URL = "https://api.flightlogger.net/graphql";

const QUERY = `
  query FleetTtaf {
    aircraft(first: 200) {
      nodes {
        callSign
        totalAirborneMinutes
      }
    }
  }
`;

type FlightloggerNode = {
  callSign: string | null;
  totalAirborneMinutes: number | null;
};

type FlightloggerResponse = {
  data?: {
    aircraft?: {
      nodes?: FlightloggerNode[];
    };
  };
  errors?: unknown;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async function handler(): Promise<Response> {
  const token = process.env.FLIGHTLOGGER_TOKEN;
  if (!token) {
    return jsonResponse(
      { error: "FLIGHTLOGGER_TOKEN env var is not configured on the server." },
      500,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(FLIGHTLOGGER_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: QUERY }),
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Network error contacting Flightlogger",
        details: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return jsonResponse(
      {
        error: `Flightlogger returned HTTP ${upstream.status}`,
        details: text.slice(0, 500),
      },
      502,
    );
  }

  let payload: FlightloggerResponse;
  try {
    payload = (await upstream.json()) as FlightloggerResponse;
  } catch (err) {
    return jsonResponse(
      {
        error: "Flightlogger returned non-JSON response",
        details: err instanceof Error ? err.message : String(err),
      },
      502,
    );
  }

  if (payload.errors) {
    return jsonResponse(
      { error: "Flightlogger GraphQL error", details: payload.errors },
      502,
    );
  }

  const nodes = payload.data?.aircraft?.nodes ?? [];
  const aircraft = nodes
    .filter((n): n is FlightloggerNode & { callSign: string } =>
      typeof n.callSign === "string" && n.callSign.trim().length > 0,
    )
    .map((n) => ({
      callSign: n.callSign.trim(),
      totalAirborneMinutes: n.totalAirborneMinutes,
    }));

  return jsonResponse({ aircraft, fetchedAt: new Date().toISOString() }, 200);
}
