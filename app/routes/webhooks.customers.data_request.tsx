import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received mandatory GDPR ${topic} webhook for ${shop}`);

  // Handle customer data request logic if needed
  // For standard SaaS apps, you can log it and return 200.

  return new Response();
};
