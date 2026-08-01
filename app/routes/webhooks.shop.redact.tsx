import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received mandatory GDPR ${topic} webhook for ${shop}`);

  // Handle shop data deletion redact logic if needed

  return new Response();
};
