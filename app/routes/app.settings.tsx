import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { data } from "react-router";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Query active subscriptions to check tier
  const response = await admin.graphql(`
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

  const resJson = await response.json();
  const activeSubscriptions = resJson.data?.currentAppInstallation?.activeSubscriptions || [];
  const activeSubscription = activeSubscriptions.find((s: any) => s.status === "ACTIVE");
  const isPremium = activeSubscription ? true : false;

  const settings = await prisma.shopSettings.upsert({
    where: { shopDomain },
    update: {},
    create: {
      shopDomain,
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

  return { settings, isPremium, shopDomain };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  // Query active subscriptions to verify tier
  const response = await admin.graphql(`
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

  const resJson = await response.json();
  const activeSubscriptions = resJson.data?.currentAppInstallation?.activeSubscriptions || [];
  const activeSubscription = activeSubscriptions.find((s: any) => s.status === "ACTIVE");
  const isPremium = activeSubscription ? true : false;

  const isActive = formData.get("isActive") === "true";
  const withdrawalWindowDays = Number(formData.get("withdrawalWindowDays")) || 14;
  const customEmailSubject = formData.get("customEmailSubject") as string;
  const customEmailBody = formData.get("customEmailBody") as string;
  const buttonColor = formData.get("buttonColor") as string;
  const buttonTextColor = formData.get("buttonTextColor") as string;
  const buttonLabel = formData.get("buttonLabel") as string;
  
  const buttonPlacement = formData.get("buttonPlacement") as string || "sticky_bottom_right";
  const limitToEU = formData.get("limitToEU") === "true";

  // Enforce Premium features
  if (!isPremium) {
    if (buttonPlacement === "inline") {
      return data({ success: false, error: "The 'Inline Section' placement is a premium feature. Please upgrade your plan." });
    }
    if (limitToEU) {
      return data({ success: false, error: "Limiting visibility to EU countries is a premium feature. Please upgrade your plan." });
    }
  }

  await prisma.shopSettings.update({
    where: { shopDomain },
    data: {
      isActive,
      withdrawalWindowDays,
      customEmailSubject,
      customEmailBody,
      buttonColor,
      buttonTextColor,
      buttonLabel,
      buttonPlacement,
      limitToEU
    }
  });

  return data({ success: true });
};

export default function Settings() {
  const { settings, isPremium, shopDomain } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [selectedPlacement, setSelectedPlacement] = useState(settings.buttonPlacement);
  const [limitToEUVal, setLimitToEUVal] = useState(settings.limitToEU);

  const isSaving = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Settings saved successfully");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="App Settings">
      <style>{`
        .form-card {
          background: #ffffff;
          border: 1px solid #e1e3e5;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          margin-bottom: 24px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 768px) {
          .form-grid-2col {
            grid-template-columns: 1fr 1fr;
          }
        }
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-label {
          font-size: 14px;
          font-weight: 600;
          color: #202223;
        }
        .input-text, .input-select, .input-textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d2d5d8;
          border-radius: 4px;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
        }
        .input-text:focus, .input-select:focus, .input-textarea:focus {
          border-color: #008060;
        }
        .input-color-container {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .input-color-picker {
          width: 40px;
          height: 38px;
          padding: 0;
          border: 1px solid #d2d5d8;
          border-radius: 4px;
          cursor: pointer;
        }
        .helper-text {
          font-size: 12px;
          color: #6d7175;
          margin-top: 4px;
        }
        .btn-container {
          display: flex;
          justify-content: flex-end;
          margin-top: 16px;
        }
        .badge-premium {
          background: #ffeb3b;
          color: #5c3800;
          font-size: 10px;
          font-weight: bold;
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 6px;
          display: inline-block;
          vertical-align: middle;
        }
      `}</style>

      <fetcher.Form method="POST">
        <s-section heading="Compliance Widget Customization">
          <s-paragraph>
            Configure the visual appearance and behavior of the storefront withdrawal widget.
          </s-paragraph>
          
          <div className="form-card">
            <div className="form-grid">
              
              <div className="form-field">
                <label className="form-label" htmlFor="isActive">Widget Status</label>
                <select className="input-select" id="isActive" name="isActive" defaultValue={String(settings.isActive)}>
                  <option value="true">Active (Visible to users)</option>
                  <option value="false">Inactive (Hidden)</option>
                </select>
                <span className="helper-text">
                  Allows you to temporarily disable the widget button from appearing on the storefront.
                </span>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="buttonPlacement">
                  Button Placement
                  {!isPremium && <span className="badge-premium">PREMIUM</span>}
                </label>
                <select 
                  className="input-select" 
                  id="buttonPlacement" 
                  name="buttonPlacement" 
                  value={selectedPlacement}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "inline" && !isPremium) {
                      shopify.toast.show("Inline placement is a Premium feature. Please upgrade your plan.", { isError: true });
                      return;
                    }
                    setSelectedPlacement(val);
                  }}
                >
                  <option value="sticky_bottom_right">Sticky Bottom Right</option>
                  <option value="sticky_bottom_left">Sticky Bottom Left</option>
                  <option value="inline">Inline Section (Premium Only)</option>
                </select>
                <span className="helper-text">
                  Configure if you want a global sticky/floating button, or an inline section button manually placed on your theme.
                </span>
                
                {selectedPlacement === "inline" && (
                  <div style={{ background: "#eaf5ff", borderLeft: "4px solid #006ebc", padding: "16px", borderRadius: "4px", marginTop: "12px", fontSize: "13px", lineHeight: "1.5", color: "#003b66" }}>
                    <strong>ℹ️ How to add the Inline Section button to your theme:</strong>
                    <ol style={{ margin: "6px 0 10px 0", paddingLeft: "20px" }}>
                      <li>Go to your Shopify Admin &gt; <strong>Online Store &gt; Themes</strong>.</li>
                      <li>Click <strong>Customize</strong> next to your active theme.</li>
                      <li>Navigate to the page template (e.g. Footer or Cart page).</li>
                      <li>In the left panel, click <strong>Add section</strong> at the bottom.</li>
                      <li>Click the <strong>Apps</strong> tab and select <strong>Withdrawal Button</strong>.</li>
                      <li>Position the block and click <strong>Save</strong>.</li>
                    </ol>
                    <a
                      href={`https://${shopDomain}/admin/themes/current/editor?context=apps`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-block", background: "#006ebc", color: "#ffffff", padding: "6px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold", textDecoration: "none", marginTop: "6px" }}
                    >
                      Open Theme Editor (Deep Link)
                    </a>
                  </div>
                )}
              </div>

              <div className="form-field" style={{ flexDirection: "row", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                <input 
                  type="checkbox" 
                  id="limitToEU" 
                  name="limitToEUMember" 
                  checked={limitToEUVal}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (checked && !isPremium) {
                      shopify.toast.show("Limiting visibility to EU countries is a Premium feature. Please upgrade your plan.", { isError: true });
                      return;
                    }
                    setLimitToEUVal(checked);
                  }}
                  style={{ width: "20px", height: "20px", cursor: "pointer" }}
                />
                <input type="hidden" name="limitToEU" value={limitToEUVal ? "true" : "false"} />
                <label className="form-label" htmlFor="limitToEU" style={{ margin: 0, fontWeight: 500, cursor: "pointer" }}>
                  Limit visibility to EU countries only
                  {!isPremium && <span className="badge-premium">PREMIUM</span>}
                </label>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="withdrawalWindowDays">Withdrawal Window (Days)</label>
                <input
                  className="input-text"
                  type="number"
                  id="withdrawalWindowDays"
                  name="withdrawalWindowDays"
                  defaultValue={settings.withdrawalWindowDays}
                  min="1"
                  required
                />
                <span className="helper-text">
                  Statutory minimum is 14 days in the EU. Requests submitted after this many days from order fulfillment will be automatically rejected.
                </span>
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="buttonLabel">Button Label</label>
                <input
                  className="input-text"
                  type="text"
                  id="buttonLabel"
                  name="buttonLabel"
                  defaultValue={settings.buttonLabel}
                  required
                />
                <span className="helper-text">
                  The label displayed on the trigger button (e.g. "Withdraw from Contract" or "Widerrufsrecht ausüben").
                </span>
              </div>

              <div className="form-grid form-grid-2col" style={{ display: "grid", gap: "16px" }}>
                <div className="form-field">
                  <label className="form-label" htmlFor="buttonColor">Button Color</label>
                  <div className="input-color-container">
                    <input
                      className="input-color-picker"
                      type="color"
                      name="buttonColor"
                      defaultValue={settings.buttonColor}
                      id="buttonColorPicker"
                      onChange={(e) => {
                        const txt = document.getElementById("buttonColorText") as HTMLInputElement;
                        if (txt) txt.value = e.target.value;
                      }}
                    />
                    <input
                      className="input-text"
                      type="text"
                      id="buttonColorText"
                      name="buttonColor"
                      defaultValue={settings.buttonColor}
                      pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                      placeholder="#000000"
                      onChange={(e) => {
                        const picker = document.getElementById("buttonColorPicker") as HTMLInputElement;
                        if (picker && e.target.value.match(/^#([A-Fa-f0-9]{6})$/)) picker.value = e.target.value;
                      }}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label className="form-label" htmlFor="buttonTextColor">Button Text Color</label>
                  <div className="input-color-container">
                    <input
                      className="input-color-picker"
                      type="color"
                      name="buttonTextColor"
                      defaultValue={settings.buttonTextColor}
                      id="buttonTextColorPicker"
                      onChange={(e) => {
                        const txt = document.getElementById("buttonTextColorText") as HTMLInputElement;
                        if (txt) txt.value = e.target.value;
                      }}
                    />
                    <input
                      className="input-text"
                      type="text"
                      id="buttonTextColorText"
                      name="buttonTextColor"
                      defaultValue={settings.buttonTextColor}
                      pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
                      placeholder="#ffffff"
                      onChange={(e) => {
                        const picker = document.getElementById("buttonTextColorPicker") as HTMLInputElement;
                        if (picker && e.target.value.match(/^#([A-Fa-f0-9]{6})$/)) picker.value = e.target.value;
                      }}
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>
        </s-section>

        <s-section heading="Legal Email Confirmation Settings">
          <s-paragraph>
            These details will be used in the confirmation email automatically generated and sent to customers upon a successful withdrawal submission.
          </s-paragraph>

          <div className="form-card">
            <div className="form-grid">
              
              <div className="form-field">
                <label className="form-label" htmlFor="customEmailSubject">Email Subject</label>
                <input
                  className="input-text"
                  type="text"
                  id="customEmailSubject"
                  name="customEmailSubject"
                  defaultValue={settings.customEmailSubject}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label" htmlFor="customEmailBody">Email Body Text</label>
                <textarea
                  className="input-textarea"
                  id="customEmailBody"
                  name="customEmailBody"
                  defaultValue={settings.customEmailBody}
                  rows={4}
                  required
                />
                <span className="helper-text">
                  The order number, reference ID, and selected list of items will be automatically appended to the end of this message body.
                </span>
              </div>

            </div>
          </div>

          <div className="btn-container">
            <s-button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </s-button>
          </div>
        </s-section>
      </fetcher.Form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
import { useRouteError } from "react-router";
