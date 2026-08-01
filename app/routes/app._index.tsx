import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Fetch settings to ensure database configuration exists
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
      buttonLabel: "Withdraw from Contract"
    }
  });

  // Fetch requests for this shop
  const requests = await prisma.withdrawalRequest.findMany({
    where: { shopDomain },
    orderBy: { submittedAt: "desc" }
  });

  return { requests, settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const requestId = Number(formData.get("requestId"));

  if (actionType === "approve") {
    const withdrawal = await prisma.withdrawalRequest.findUnique({
      where: { id: requestId }
    });

    if (!withdrawal) {
      return { success: false, error: "Withdrawal request not found" };
    }

    // Add compliance tag to the Shopify order
    try {
      await admin.graphql(`
        #graphql
        mutation addTags($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            node {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          id: withdrawal.shopifyOrderId,
          tags: ["EU-Withdrawal-Approved"]
        }
      });
    } catch (err) {
      console.error("Failed to tag order:", err);
    }

    // Update database status
    await prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: "approved",
        processedAt: new Date(),
        complianceNotes: "Approved by merchant. Tagged order with 'EU-Withdrawal-Approved'."
      }
    });

    return { success: true, message: "Request approved and order tagged." };
  }

  if (actionType === "reject") {
    const reason = (formData.get("reason") as string) || "Rejected by merchant.";
    await prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: "rejected",
        processedAt: new Date(),
        complianceNotes: `Rejected. Reason: ${reason}`
      }
    });
    return { success: true, message: "Request rejected." };
  }

  return { success: false, error: "Invalid action" };
};

export default function Index() {
  const { requests, settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [activeRequest, setActiveRequest] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Action processed successfully");
      setActiveRequest(null);
      setRejectReason("");
      setIsRejecting(false);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleApprove = (id: number) => {
    fetcher.submit(
      { actionType: "approve", requestId: String(id) },
      { method: "POST" }
    );
  };

  const handleRejectSubmit = (id: number) => {
    fetcher.submit(
      { actionType: "reject", requestId: String(id), reason: rejectReason },
      { method: "POST" }
    );
  };

  // Convert raw graphql ID to a usable URL for order details
  const getOrderAdminUrl = (graphqlId: string) => {
    const rawId = graphqlId.split("/").pop();
    return `https://admin.shopify.com/store/${settings.shopDomain.split(".")[0]}/orders/${rawId}`;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "approved":
        return "badge-success";
      case "rejected":
        return "badge-critical";
      default:
        return "badge-attention";
    }
  };

  return (
    <s-page heading="EU Withdrawal Requests">
      <style>{`
        .requests-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
        }
        .request-card {
          background: #ffffff;
          border: 1px solid #e1e3e5;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s ease;
        }
        .request-card:hover {
          border-color: #a4acb3;
          box-shadow: 0 2px 6px rgba(0,0,0,0.08);
        }
        .request-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .order-name {
          font-size: 16px;
          font-weight: 600;
          color: #202223;
        }
        .customer-email {
          font-size: 14px;
          color: #6d7175;
        }
        .request-date {
          font-size: 12px;
          color: #8c9196;
        }
        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
        }
        .badge-attention {
          background: #ffe5b5;
          color: #8a6116;
        }
        .badge-success {
          background: #e2f9e9;
          color: #108043;
        }
        .badge-critical {
          background: #fed3d3;
          color: #c92424;
        }
        .actions-cell {
          display: flex;
          gap: 8px;
        }
        .empty-state {
          text-align: center;
          padding: 48px;
          background: #ffffff;
          border: 1px dashed #e1e3e5;
          border-radius: 8px;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        .custom-modal {
          background: #ffffff;
          border-radius: 8px;
          width: 500px;
          max-width: 90%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          overflow: hidden;
        }
        .modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e1e3e5;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-title {
          font-size: 16px;
          font-weight: 600;
          margin: 0;
        }
        .modal-body {
          padding: 20px;
        }
        .modal-footer {
          padding: 16px 20px;
          border-top: 1px solid #e1e3e5;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
        .form-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d2d5d8;
          border-radius: 4px;
          outline: none;
          margin-top: 8px;
        }
        .form-input:focus {
          border-color: #008060;
        }
        .pill {
          background: #f1f2f4;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          margin-right: 6px;
          display: inline-block;
          margin-top: 4px;
        }
      `}</style>

      <s-section heading="Manage Incoming Contract Cancellations">
        <s-paragraph>
          Below are the contract withdrawal requests submitted by customers through your storefront widget. Confirming a request tags the order in Shopify for audit compliance.
        </s-paragraph>

        {requests.length === 0 ? (
          <div className="empty-state">
            <s-heading>No requests found</s-heading>
            <s-paragraph>
              All clear! When clients request contract withdrawals, they will appear here.
            </s-paragraph>
          </div>
        ) : (
          <div className="requests-container">
            {requests.map((req) => {
              const selectedItemsArray = req.selectedItems as Array<any> || [];
              return (
                <div key={req.id} className="request-card">
                  <div className="request-info">
                    <s-stack direction="inline" gap="small">
                      <span className="order-name">{req.orderName}</span>
                      <span className={`badge ${getStatusBadgeClass(req.status)}`}>
                        {req.status}
                      </span>
                    </s-stack>
                    <span className="customer-email">{req.customerEmail}</span>
                    <span className="request-date">
                      Submitted: {new Date(req.submittedAt).toLocaleString()}
                    </span>
                    <div>
                      {selectedItemsArray.map((item, idx) => (
                        <span key={idx} className="pill">
                          {item.title} (x{item.quantity})
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="actions-cell">
                    <s-button variant="secondary" onClick={() => setActiveRequest(req)}>
                      View Details
                    </s-button>
                    {req.status === "pending_review" && (
                      <>
                        <s-button onClick={() => handleApprove(req.id)}>
                          Approve Tagging
                        </s-button>
                        <s-button variant="critical" onClick={() => {
                          setActiveRequest(req);
                          setIsRejecting(true);
                        }}>
                          Reject
                        </s-button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </s-section>

      {/* View Details / Action Modal */}
      {activeRequest && (
        <div className="modal-overlay" onClick={() => {
          setActiveRequest(null);
          setIsRejecting(false);
        }}>
          <div className="custom-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {isRejecting ? "Reject Request" : `Request Details - ${activeRequest.orderName}`}
              </h3>
              <s-button onClick={() => {
                setActiveRequest(null);
                setIsRejecting(false);
              }} variant="tertiary">
                Close
              </s-button>
            </div>
            
            <div className="modal-body">
              {isRejecting ? (
                <div>
                  <s-paragraph>
                    Provide a reason for rejecting this cancellation request (e.g., "Outside 14-day statutory return period"). The reason will be saved in compliance notes.
                  </s-paragraph>
                  <label htmlFor="rejectReason" style={{ fontSize: "14px", fontWeight: 600 }}>Reason for rejection</label>
                  <input
                    type="text"
                    id="rejectReason"
                    className="form-input"
                    placeholder="Enter reason..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <strong>Order Link:</strong>{" "}
                    <a
                      href={getOrderAdminUrl(activeRequest.shopifyOrderId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#008060", textDecoration: "none" }}
                    >
                      Open Order #{activeRequest.orderName.replace("#", "")} in Shopify
                    </a>
                  </div>
                  <div>
                    <strong>Customer Email:</strong> {activeRequest.customerEmail}
                  </div>
                  <div>
                    <strong>Status:</strong>{" "}
                    <span className={`badge ${getStatusBadgeClass(activeRequest.status)}`}>
                      {activeRequest.status}
                    </span>
                  </div>
                  <div>
                    <strong>Submitted:</strong> {new Date(activeRequest.submittedAt).toLocaleString()}
                  </div>
                  {activeRequest.processedAt && (
                    <div>
                      <strong>Processed:</strong> {new Date(activeRequest.processedAt).toLocaleString()}
                    </div>
                  )}
                  <div>
                    <strong>Items Requested for Withdrawal:</strong>
                    <ul style={{ margin: "6px 0", paddingLeft: "20px" }}>
                      {(activeRequest.selectedItems as Array<any>).map((item, idx) => (
                        <li key={idx}>
                          {item.title} &mdash; Qty: {item.quantity}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {activeRequest.complianceNotes && (
                    <div style={{ background: "#f6f6f7", padding: "10px", borderRadius: "4px", borderLeft: "4px solid #8c9196" }}>
                      <strong>Compliance Notes:</strong>
                      <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#4f5255" }}>
                        {activeRequest.complianceNotes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <s-button variant="secondary" onClick={() => {
                setActiveRequest(null);
                setIsRejecting(false);
              }}>
                Cancel
              </s-button>
              {isRejecting ? (
                <s-button variant="critical" onClick={() => handleRejectSubmit(activeRequest.id)}>
                  Submit Rejection
                </s-button>
              ) : (
                activeRequest.status === "pending_review" && (
                  <s-button onClick={() => handleApprove(activeRequest.id)}>
                    Approve Tagging
                  </s-button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
