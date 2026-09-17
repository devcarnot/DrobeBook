import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const next = new URL("/app/products", url.origin);
  next.searchParams.set("import", "1");
  return redirect(`${next.pathname}${next.search}`);
};

export default function ImportProductsRedirect() {
  return null;
}
