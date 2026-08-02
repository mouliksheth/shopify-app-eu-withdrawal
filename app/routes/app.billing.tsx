import { data, Form, useLoaderData, useRouteError } from "react-router";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

const BASIC_PLAN = "Basic Plan";
const GROWTH_PLAN = "Growth Plan";
const UNLIMITED_PLAN = "Unlimited Plan";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Fetch active subscriptions and store plan using GraphQL
  const response = await admin.graphql(`
    #graphql
    query {
      shop {
        plan {
          partnerDevelopment
        }
      }
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }
  `);

  const resJson = await response.json();
  const isDevStore = resJson.data?.shop?.plan?.partnerDevelopment || false;
  const activeSubscriptions = resJson.data?.currentAppInstallation?.activeSubscriptions || [];
  
  // Find if there is an active recurring charge
  const activeSubscription = activeSubscriptions.find((s: any) => s.status === "ACTIVE");

  return data({
    activeSubscriptionName: activeSubscription 
      ? activeSubscription.name 
      : (isDevStore ? "Dev Mode (Premium Bypass)" : "Free Plan"),
    activeSubscriptionId: activeSubscription ? activeSubscription.id : null,
    isDevStore,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {
    if (actionType === "upgrade") {
      const planName = formData.get("planName") as string;
      const shopDomain = session.shop;
      const returnUrl = `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/billing`;
      
      const planPrice = planName === BASIC_PLAN ? 4.99 : planName === GROWTH_PLAN ? 14.99 : 24.99;

      // Run the subscription mutation manually to inspect the exact userErrors from Shopify
      const mutationRes = await admin.graphql(`
        #graphql
        mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
          appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test) {
            appSubscription {
              id
            }
            confirmationUrl
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          name: planName,
          returnUrl,
          test: true,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    amount: planPrice,
                    currencyCode: "USD"
                  },
                  interval: "EVERY_30_DAYS"
                }
              }
            }
          ]
        }
      });

      const resJson = await mutationRes.json();
      console.log("Manual billing mutation response:", JSON.stringify(resJson));

      const userErrors = resJson.data?.appSubscriptionCreate?.userErrors || [];
      if (userErrors.length > 0) {
        return data({ 
          success: false, 
          error: `Shopify Billing rejected: ${userErrors[0].message} (Field: ${userErrors[0].field?.join(".") || "none"})`
        }, { status: 400 });
      }

      const confirmationUrl = resJson.data?.appSubscriptionCreate?.confirmationUrl;
      if (confirmationUrl) {
        throw new Response(null, {
          status: 302,
          headers: {
            Location: confirmationUrl
          }
        });
      }

      return data({ success: false, error: "Failed to obtain billing confirmation URL from Shopify." }, { status: 500 });
    }

    if (actionType === "downgrade_free") {
      const subscriptionId = formData.get("subscriptionId") as string;
      
      if (subscriptionId) {
        // Cancel active subscription via GraphQL Admin API
        const cancelResponse = await admin.graphql(`
          #graphql
          mutation appSubscriptionCancel($id: ID!) {
            appSubscriptionCancel(id: $id) {
              appSubscription {
                id
                status
              }
              userErrors {
                field
                message
              }
            }
          }
        `, {
          variables: { id: subscriptionId }
        });
        
        const resJson = await cancelResponse.json();
        const userErrors = resJson.data?.appSubscriptionCancel?.userErrors || [];
        
        if (userErrors.length > 0) {
          return data({ success: false, error: userErrors[0].message });
        }
      }
      
      return data({ success: true, message: "Successfully downgraded to the Free Plan." });
    }

    return data({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Billing action failed:", error);
    if (error instanceof Response) {
      throw error;
    }
    return data({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};

export default function Billing() {
  const { activeSubscriptionName, activeSubscriptionId, isDevStore } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  return (
    <s-page heading="Pricing Plans">
      {isDevStore && (
        <div style={{ background: "#e2f9e9", border: "1px solid #a3e2bb", padding: "16px", borderRadius: "8px", marginBottom: "20px", color: "#108043", fontSize: "14px", lineHeight: "1.4" }}>
          <strong>🛠️ Development Store Bypass Active:</strong> This store is recognized as a Partner Development store. You have full free access to all Premium features (Inline placement, EU countries filter) without needing to approve any charges.
        </div>
      )}
      <style>{`
        .pricing-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin-top: 24px;
        }
        @media (min-width: 768px) {
          .pricing-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .pricing-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }
        .price-card {
          background: #ffffff;
          border: 1px solid #e1e3e5;
          border-radius: 8px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          position: relative;
          transition: all 0.2s ease;
        }
        .price-card.active {
          border-color: #008060;
          box-shadow: 0 0 0 2px #008060;
        }
        .price-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 10px rgba(0,0,0,0.08);
        }
        .current-badge {
          position: absolute;
          top: 12px;
          background: #e2f9e9;
          color: #108043;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }
        .plan-title {
          font-size: 18px;
          font-weight: 700;
          color: #202223;
          margin-bottom: 8px;
          margin-top: 12px;
        }
        .plan-price {
          font-size: 28px;
          font-weight: 800;
          color: #202223;
          margin-bottom: 4px;
        }
        .plan-interval {
          font-size: 12px;
          color: #6d7175;
          margin-bottom: 16px;
        }
        .plan-features {
          width: 100%;
          border-top: 1px solid #f1f2f4;
          padding-top: 16px;
          margin-bottom: 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          font-size: 14px;
          color: #4f5255;
          flex-grow: 1;
        }
        .feature-item {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .feature-check {
          color: #008060;
          font-weight: bold;
        }
        .btn-select {
          width: 100%;
        }
      `}</style>

      <s-section heading="Select a Subscription Tier">
        <s-paragraph>
          Ensure compliance with EU laws by choosing the plan that best fits your shop's order volume.
        </s-paragraph>

        <div className="pricing-grid">
          
          {/* Free Plan */}
          <div className={`price-card ${activeSubscriptionName === "Free Plan" ? "active" : ""}`}>
            {activeSubscriptionName === "Free Plan" && <span className="current-badge">Active Plan</span>}
            <div className="plan-title">Free</div>
            <div className="plan-price">$0</div>
            <div className="plan-interval">Forever Free</div>
            <div className="plan-features">
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>5 Requests / Month</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Standard Widget</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Email Confirmations</span>
              </div>
            </div>
            {activeSubscriptionName !== "Free Plan" ? (
              <Form method="post" style={{ width: "100%" }} onSubmit={(e) => {
                if (!confirm("Are you sure you want to cancel your paid plan and return to the Free tier?")) {
                  e.preventDefault();
                }
              }}>
                <input type="hidden" name="actionType" value="downgrade_free" />
                <input type="hidden" name="subscriptionId" value={activeSubscriptionId || ""} />
                <s-button type="submit" className="btn-select" variant="secondary">
                  Downgrade to Free
                </s-button>
              </Form>
            ) : (
              <s-button className="btn-select" disabled>Current Plan</s-button>
            )}
          </div>

          {/* Basic Plan */}
          <div className={`price-card ${activeSubscriptionName === BASIC_PLAN ? "active" : ""}`}>
            {activeSubscriptionName === BASIC_PLAN && <span className="current-badge">Active Plan</span>}
            <div className="plan-title">Basic</div>
            <div className="plan-price">$4.99</div>
            <div className="plan-interval">per month</div>
            <div className="plan-features">
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>25 Requests / Month</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Custom Styling Options</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Order Tagging</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Email Confirmations</span>
              </div>
            </div>
            {activeSubscriptionName !== BASIC_PLAN ? (
              <Form method="post" style={{ width: "100%" }}>
                <input type="hidden" name="actionType" value="upgrade" />
                <input type="hidden" name="planName" value={BASIC_PLAN} />
                <s-button type="submit" className="btn-select">
                  {activeSubscriptionName === "Free Plan" ? "Upgrade" : "Select Plan"}
                </s-button>
              </Form>
            ) : (
              <s-button className="btn-select" disabled>Current Plan</s-button>
            )}
          </div>

          {/* Growth Plan */}
          <div className={`price-card ${activeSubscriptionName === GROWTH_PLAN ? "active" : ""}`}>
            {activeSubscriptionName === GROWTH_PLAN && <span className="current-badge">Active Plan</span>}
            <div className="plan-title">Growth</div>
            <div className="plan-price">$14.99</div>
            <div className="plan-interval">per month</div>
            <div className="plan-features">
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>100 Requests / Month</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>All Basic Features</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Priority Email Support</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Advanced Customizations</span>
              </div>
            </div>
            {activeSubscriptionName !== GROWTH_PLAN ? (
              <Form method="post" style={{ width: "100%" }}>
                <input type="hidden" name="actionType" value="upgrade" />
                <input type="hidden" name="planName" value={GROWTH_PLAN} />
                <s-button type="submit" className="btn-select">
                  {activeSubscriptionName === "Free Plan" ? "Upgrade" : "Select Plan"}
                </s-button>
              </Form>
            ) : (
              <s-button className="btn-select" disabled>Current Plan</s-button>
            )}
          </div>

          {/* Unlimited Plan */}
          <div className={`price-card ${activeSubscriptionName === UNLIMITED_PLAN ? "active" : ""}`}>
            {activeSubscriptionName === UNLIMITED_PLAN && <span className="current-badge">Active Plan</span>}
            <div className="plan-title">Unlimited</div>
            <div className="plan-price">$24.99</div>
            <div className="plan-interval">per month</div>
            <div className="plan-features">
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <strong>Unlimited Requests</strong>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Dedicated Integration Help</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>All Growth Features</span>
              </div>
              <div className="feature-item">
                <span className="feature-check">&#10003;</span>
                <span>Custom PDF Receipts</span>
              </div>
            </div>
            {activeSubscriptionName !== UNLIMITED_PLAN ? (
              <Form method="post" style={{ width: "100%" }}>
                <input type="hidden" name="actionType" value="upgrade" />
                <input type="hidden" name="planName" value={UNLIMITED_PLAN} />
                <s-button type="submit" className="btn-select">
                  {activeSubscriptionName === "Free Plan" ? "Upgrade" : "Select Plan"}
                </s-button>
              </Form>
            ) : (
              <s-button className="btn-select" disabled>Current Plan</s-button>
            )}
          </div>

        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
