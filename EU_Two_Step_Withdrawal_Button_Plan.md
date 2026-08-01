# Product Specification & Architecture Plan: EU Two-Step Withdrawal Button Compliance App

## 1. Executive Summary & Market Fit
*   **Target Regulatory Trigger:** **EU Directive 2023/2673** (specifically the mandatory 2-step "Withdrawal/Cancellation Button" for D2C/B2C online distance contracts).
*   **The Penalty:** If absent, the consumer's right to withdraw is automatically extended from **14 days to 12 months**, plus direct administrative fines up to 4% of annual turnover or €75,000 per violation (e.g., in Italy/Germany).
*   **The Pain Point:** Shopify's native checkout and theme layouts do not provide a legally compliant, two-step guest/member contract cancellation workflow out-of-the-box.
*   **Target Status:** Highly optimized for "Built for Shopify" (BFS) guidelines using App Bridge 3, App Embeds, and native Polaris components.

---

## 2. Core Functional Requirements

### Feature 1: The Compliant Two-Step Frontend Widget (Theme App Extension)
*   **Step 1: The Trigger Button.** A highly visible button/link (e.g., "Withdraw from Contract" / "Widerrufsrecht ausüben") that can be embedded into the footer, order confirmation page, or customer account portal.
    *   *Requirement:* Must work for both logged-in customers and guest checkouts.
*   **Step 2: The Confirmation Form.** An overlay modal or dedicated page featuring:
    *   Verification fields: Order Number and Billing Email Address (bypasses the need for guest login).
    *   Standard statutory fields: "I hereby withdraw from the contract concluded by me for the purchase of the following goods..."
    *   Product Selection: Allows the customer to select individual products from the order or the entire order.
    *   Instant submission button: "Confirm Withdrawal" (the second step).
*   **Instant Confirmation Receipt:** On submission, the app must immediately display an on-screen reference ID and trigger a legally compliant email confirmation to the consumer containing the timestamp, order details, and withdrawal confirmation.

### Feature 2: The Merchant Admin Dashboard (Shopify Admin)
*   **Incoming Requests Log:** A real-time table displaying all submitted withdrawal requests with statuses: `Pending Review`, `Approved (Refund Initiated)`, `Rejected (Out of Window)`, or `Completed`.
*   **Automatic Window Verification:** The app automatically compares the submission timestamp against the Shopify order's fulfillment date to flag if it falls inside the statutory 14-day window (or the merchant's custom return window).
*   **One-Click Refund/Restock Action:** Integration with Shopify’s native Order & Refund API allowing the merchant to process the refund directly from the app dashboard without manual copy-pasting.

---

## 3. Technical Architecture & Data Model

### Shopify APIs Utilized
1.  **GraphQL Admin API:** To fetch order details, verify emails, and trigger refunds/returns (`refundCreate`, `returnCreate`).
2.  **Theme App Extensions (App Embed Blocks & App Blocks):** To inject the widget without editing the merchant's theme code (mandatory for "Built for Shopify" validation).
3.  **App Proxy API:** Securely route form submissions from the storefront to the app backend bypass CORS issues, verifying submissions with HMAC signatures.

### Database Schema (PostgreSQL Recommended)
```sql
CREATE TABLE withdrawal_requests (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER REFERENCES shops(id) ON DELETE CASCADE,
    shopify_order_id VARCHAR(255) NOT NULL,
    order_name VARCHAR(100) NOT NULL, -- e.g. #1001
    customer_email VARCHAR(255) NOT NULL,
    selected_items JSONB NOT NULL,     -- Array of line item IDs and quantities
    status VARCHAR(50) DEFAULT 'pending_review', -- pending, approved, rejected, completed
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    compliance_notes TEXT
);

CREATE TABLE shop_settings (
    id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    withdrawal_window_days INTEGER DEFAULT 14,
    custom_email_subject VARCHAR(255) DEFAULT 'Confirmation of Your Contract Withdrawal',
    custom_email_body TEXT,
    button_color VARCHAR(7) DEFAULT '#000000',
    button_text_color VARCHAR(7) DEFAULT '#ffffff',
    button_label VARCHAR(100) DEFAULT 'Withdraw from Contract'
);
```

---

## 4. "Built for Shopify" Compliance Strategy
To achieve the coveted **Built for Shopify** badge and premium App Store placement:
*   **Performance:** The Frontend Theme Extension must use pure, vanilla JavaScript (no jQuery or heavy external JS libraries). Total assets loaded on the frontend must be < 10KB.
*   **Design System:** The merchant admin dashboard must be built using **Shopify Polaris v12+** React components. It must look and feel identical to Shopify's native admin layout.
*   **App Bridge:** Seamlessly integrated using Shopify App Bridge 3.0 to manage navigation, toasts, modals, and contextual save bars.
*   **Security:** Session Tokens must be used for all backend API authentication; absolutely no legacy cookie-based authentication.

---

## 5. Development Roadmap & Quick-To-Market Execution

*   **Days 1–3: Backend & Schema.** Set up the Node.js/Remix or Rails template with the database schema. Implement the App Proxy endpoints.
*   **Days 4–6: Frontend Extension.** Develop the Theme App Extension (App Embed block). Add settings for customizable translations (since localizing to German, Italian, and French is a major selling point).
*   **Days 7–9: Polaris Dashboard.** Build the Merchant log interface, email notification templates (via SendGrid or Shopify Email API), and Refund API integrations.
*   **Day 10: App Store Submission.** Verify automated test coverage, write the listing copy emphasizing immediate EU compliance safety, and submit.
