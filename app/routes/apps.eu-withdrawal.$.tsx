import { data, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// CORS headers for storefront requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle OPTIONS requests (for CORS preflight)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return data({}, { headers: corsHeaders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return data({}, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return data({ success: false, message: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  let authResult;
  try {
    // Authenticate the request via Shopify App Proxy
    authResult = await authenticate.public.appProxy(request);
  } catch (authError) {
    console.error("App Proxy signature verification failed:", authError);
    if (authError instanceof Response) {
      const text = await authError.text();
      return data({ success: false, message: `Signature verification failed: ${text || authError.statusText}` }, { 
        status: authError.status, 
        headers: corsHeaders 
      });
    }
    return data({ success: false, message: `Signature verification failed: ${authError instanceof Error ? authError.message : String(authError)}` }, { 
      status: 401, 
      headers: corsHeaders 
    });
  }

  const { admin, session } = authResult;

  if (!admin) {
    return data({ success: false, message: "Unauthorized. App not active on this shop." }, { status: 401, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // We expect requests to end in /verify, /submit, or /settings
    const isVerify = pathname.endsWith("/verify");
    const isSubmit = pathname.endsWith("/submit");
    const isSettings = pathname.endsWith("/settings");

    const body = await request.json();
    const { shop } = body;

    if (!shop) {
      return data({ success: false, message: "Missing shop domain" }, { status: 400, headers: corsHeaders });
    }

    // Get settings for the shop
    const settings = await prisma.shopSettings.upsert({
      where: { shopDomain: shop },
      update: {},
      create: {
        shopDomain: shop,
        withdrawalWindowDays: 14,
        customEmailSubject: "Confirmation of Your Contract Withdrawal",
        customEmailBody: "We have received your request to withdraw from the contract. Here are your details:",
        buttonColor: "#000000",
        buttonTextColor: "#ffffff",
        buttonLabel: "Withdraw from Contract",
        buttonPlacement: "sticky_bottom_right",
        limitToEU: false
      }
    });

    if (isSettings) {
      return data({
        success: true,
        settings: {
          isActive: settings.isActive,
          buttonPlacement: settings.buttonPlacement,
          buttonColor: settings.buttonColor,
          buttonTextColor: settings.buttonTextColor,
          buttonLabel: settings.buttonLabel,
          limitToEU: settings.limitToEU
        }
      }, { headers: corsHeaders });
    }

    if (isVerify) {
      const { orderName, email } = body;
      if (!orderName || !email) {
        return data({ success: false, message: "Missing order name or email" }, { status: 400, headers: corsHeaders });
      }

      // Query Shopify Admin API for the order
      const response = await admin.graphql(`
        #graphql
        query findOrder($query: String!) {
          orders(first: 1, query: $query) {
            edges {
              node {
                id
                name
                email
                createdAt
                fullyPaid
                displayFulfillmentStatus
                fulfillments(first: 5) {
                  createdAt
                  status
                }
                lineItems(first: 50) {
                  edges {
                    node {
                      id
                      title
                      quantity
                      variantTitle
                    }
                  }
                }
              }
            }
          }
        }
      `, {
        variables: {
          query: `name:${orderName.startsWith("#") ? orderName : "#" + orderName}`
        }
      });

      const resJson = await response.json();
      const orders = resJson.data?.orders?.edges;

      if (!orders || orders.length === 0) {
        return data({ success: false, message: "Order not found. Check order number." }, { status: 404, headers: corsHeaders });
      }

      const orderNode = orders[0].node;

      // Verify email matches (case insensitive), with null-safety
      const orderEmail = orderNode.email || "";
      if (orderEmail.toLowerCase() !== email.toLowerCase()) {
        return data({ success: false, message: "Verification failed. Email does not match." }, { status: 403, headers: corsHeaders });
      }

      // Check if order is eligible for withdrawal based on window
      const windowDays = settings.withdrawalWindowDays;
      let isEligible = true;
      let latestFulfillmentDate = null;

      if (orderNode.displayFulfillmentStatus === "FULFILLED") {
        const activeFulfillments = (orderNode.fulfillments || []).filter(
          (f: any) => f.status !== "CANCELLED"
        );
        if (activeFulfillments.length > 0) {
          latestFulfillmentDate = new Date(activeFulfillments[0].createdAt);
          const limitTime = latestFulfillmentDate.getTime() + windowDays * 24 * 60 * 60 * 1000;
          if (Date.now() > limitTime) {
            isEligible = false;
          }
        }
      }

      if (!isEligible) {
        return data({
          success: false,
          message: `This order is outside the statutory ${windowDays}-day withdrawal period (Fulfilled on ${latestFulfillmentDate?.toLocaleDateString()}).`
        }, { status: 400, headers: corsHeaders });
      }

      // Format line items for step 2, with null-safety
      const lineItems = (orderNode.lineItems?.edges || []).map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        variantTitle: edge.node.variantTitle,
        quantity: edge.node.quantity
      }));

      return data({
        success: true,
        order: {
          id: orderNode.id,
          name: orderNode.name,
          lineItems
        }
      }, { headers: corsHeaders });
    }

    if (isSubmit) {
      const { orderId, orderName, email, selectedItems } = body;

      if (!orderId || !orderName || !email || !selectedItems || selectedItems.length === 0) {
        return data({ success: false, message: "Missing required fields for submission" }, { status: 400, headers: corsHeaders });
      }

      // Check active subscription quota
      const activeSubsResponse = await admin.graphql(`
        #graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              name
              status
            }
          }
        }
      `);

      const activeSubsJson = await activeSubsResponse.json();
      const activeSubscriptions = activeSubsJson.data?.currentAppInstallation?.activeSubscriptions || [];
      const activeSubscription = activeSubscriptions.find((s: any) => s.status === "ACTIVE");
      const planName = activeSubscription ? activeSubscription.name : "Free Plan";

      let limit = 5;
      if (planName === "Basic Plan") limit = 25;
      else if (planName === "Growth Plan") limit = 100;
      else if (planName === "Unlimited Plan") limit = Infinity;

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const requestCount = await prisma.withdrawalRequest.count({
        where: {
          shopDomain: shop,
          submittedAt: { gte: startOfMonth }
        }
      });

      if (requestCount >= limit) {
        return data({
          success: false,
          message: "This store has reached its monthly limit of withdrawal requests. Please contact the store administrator."
        }, { status: 429, headers: corsHeaders });
      }

      // Generate a reference ID
      const referenceId = `WD-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      // Save request in DB
      await prisma.withdrawalRequest.create({
        data: {
          shopDomain: shop,
          shopifyOrderId: orderId,
          orderName: orderName,
          customerEmail: email,
          selectedItems: selectedItems, // JSON
          status: "pending_review",
          complianceNotes: `Reference ID: ${referenceId}`
        }
      });

      // Send legal confirmation email (console fallback if no SMTP configured)
      const itemsList = selectedItems.map((item: any) => `- ${item.title} (Qty: ${item.quantity})`).join("\n");
      const emailBodyText = `${settings.customEmailBody}\n\nOrder Name: ${orderName}\nReference ID: ${referenceId}\nItems:\n${itemsList}\n\nSubmitted at: ${new Date().toLocaleString()}`;
      
      console.log("=========================================");
      console.log(`SENDING LEGAL CONFIRMATION EMAIL TO ${email}`);
      console.log(`Subject: ${settings.customEmailSubject}`);
      console.log("-----------------------------------------");
      console.log(emailBodyText);
      console.log("=========================================");

      // In production, configure an email provider (like Resend)
      if (process.env.RESEND_API_KEY) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.RESEND_API_KEY}`
            },
            body: JSON.stringify({
              from: "Withdrawal Compliance <no-reply@compliance.yourstore.com>",
              to: email,
              subject: settings.customEmailSubject,
              text: emailBodyText
            })
          });
        } catch (emailErr) {
          console.error("Resend delivery failed:", emailErr);
        }
      }

      return data({
        success: true,
        referenceId
      }, { headers: corsHeaders });
    }

    return data({ success: false, message: "Unknown action path" }, { status: 404, headers: corsHeaders });

  } catch (error: any) {
    console.error("App Proxy error:", error);
    return data({ success: false, message: error.message || "Internal server error" }, { status: 500, headers: corsHeaders });
  }
};
