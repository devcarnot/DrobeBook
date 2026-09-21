import type { LoaderFunctionArgs } from "react-router";

/** Railway / uptime health check — no auth, no DB. */
export const loader = async (_args: LoaderFunctionArgs) => {
  return Response.json(
    { ok: true, service: "drobebook" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
