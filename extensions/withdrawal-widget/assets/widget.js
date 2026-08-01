(function() {
  document.addEventListener("DOMContentLoaded", async function() {
    const shop = window.ShopifyWithdrawalApp.shop;
    const proxyPath = window.ShopifyWithdrawalApp.proxyPath;
    
    // Fetch settings from App Proxy
    let settings = null;
    try {
      const response = await fetch(`${proxyPath}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop })
      });
      const resJson = await response.json();
      if (resJson.success) {
        settings = resJson.settings;
      }
    } catch (e) {
      console.error("EU Withdrawal App: Settings fetch failed", e);
    }
    
    if (!settings || !settings.isActive) {
      return; // Hide widget if inactive or settings fetch failed
    }

    // EU countries list
    const euCountries = [
      "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"
    ];
    
    const country = window.ShopifyWithdrawalApp.country || "";
    if (settings.limitToEU && !euCountries.includes(country.toUpperCase())) {
      console.log("EU Withdrawal Widget: Visitor is outside of EU. Widget hidden.");
      return;
    }

    const inlineContainer = document.querySelector("[data-eu-withdrawal-inline]");
    let triggerBtn = null;

    if (inlineContainer) {
      // Render Inline Section
      inlineContainer.innerHTML = `
        <button class="eu-withdrawal-btn" id="eu-withdrawal-trigger-btn" style="background-color: ${settings.buttonColor}; color: ${settings.buttonTextColor};">
          ${settings.buttonLabel}
        </button>
      `;
      triggerBtn = document.getElementById("eu-withdrawal-trigger-btn");
    } else if (settings.buttonPlacement.startsWith("sticky_")) {
      // Render Sticky Floating Button
      const stickyContainer = document.createElement("div");
      stickyContainer.className = "eu-withdrawal-container";
      if (settings.buttonPlacement === "sticky_bottom_left") {
        stickyContainer.style = "position: fixed; bottom: 20px; left: 20px; z-index: 999990; margin: 0;";
      } else {
        stickyContainer.style = "position: fixed; bottom: 20px; right: 20px; z-index: 999990; margin: 0;";
      }
      stickyContainer.innerHTML = `
        <button class="eu-withdrawal-btn" id="eu-withdrawal-trigger-btn" style="background-color: ${settings.buttonColor}; color: ${settings.buttonTextColor}; box-shadow: 0 4px 10px rgba(0,0,0,0.15); border-radius: 50px; padding: 12px 24px; font-weight: 600;">
          ${settings.buttonLabel}
        </button>
      `;
      document.body.appendChild(stickyContainer);
      triggerBtn = document.getElementById("eu-withdrawal-trigger-btn");
    }

    if (!triggerBtn) return;

    const overlay = document.getElementById("eu-withdrawal-overlay");
    const closeBtn = document.getElementById("eu-withdrawal-close-btn");
    const successCloseBtn = document.getElementById("eu-btn-success-close");
    
    const step1 = document.getElementById("eu-step-1");
    const step2 = document.getElementById("eu-step-2");
    const step3 = document.getElementById("eu-step-3");
    
    const inputOrder = document.getElementById("eu-input-order");
    const inputEmail = document.getElementById("eu-input-email");
    const btnVerify = document.getElementById("eu-btn-verify");
    const btnConfirm = document.getElementById("eu-btn-confirm");
    
    const errorOrder = document.getElementById("eu-error-order");
    const errorEmail = document.getElementById("eu-error-email");
    const verifyGeneralError = document.getElementById("eu-verification-general-error");
    const submitGeneralError = document.getElementById("eu-submit-general-error");
    
    const itemsContainer = document.getElementById("eu-items-container");
    const refIdSpan = document.getElementById("eu-ref-id");
    
    let orderDetails = null;

    if (!overlay) return;

    // Toggle Modal visibility
    triggerBtn.addEventListener("click", function() {
      overlay.classList.add("active");
      resetForm();
    });

    const closeModal = function() {
      overlay.classList.remove("active");
    };

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (successCloseBtn) successCloseBtn.addEventListener("click", closeModal);

    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) {
        closeModal();
      }
    });

    function resetForm() {
      step1.classList.add("active");
      step2.classList.remove("active");
      step3.classList.remove("active");
      
      inputOrder.value = "";
      inputEmail.value = "";
      
      errorOrder.style.display = "none";
      errorEmail.style.display = "none";
      verifyGeneralError.style.display = "none";
      submitGeneralError.style.display = "none";
      
      itemsContainer.innerHTML = "";
      orderDetails = null;
      btnVerify.disabled = false;
      btnVerify.textContent = "Verify Order";
      btnConfirm.disabled = false;
      btnConfirm.textContent = "Confirm Withdrawal";
    }

    function validateEmail(email) {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(String(email).toLowerCase());
    }

    btnVerify.addEventListener("click", async function() {
      const orderVal = inputOrder.value.trim();
      const emailVal = inputEmail.value.trim();
      
      let isValid = true;
      
      if (!orderVal) {
        errorOrder.style.display = "block";
        isValid = false;
      } else {
        errorOrder.style.display = "none";
      }
      
      if (!emailVal || !validateEmail(emailVal)) {
        errorEmail.style.display = "block";
        isValid = false;
      } else {
        errorEmail.style.display = "none";
      }
      
      if (!isValid) return;

      verifyGeneralError.style.display = "none";
      btnVerify.disabled = true;
      btnVerify.textContent = "Verifying...";

      try {
        const response = await fetch(`${proxyPath}/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderName: orderVal,
            email: emailVal,
            shop: shop
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Unable to verify order. Please check details and try again.");
        }

        orderDetails = result.order;
        renderOrderItems(orderDetails.lineItems);
        
        step1.classList.remove("active");
        step2.classList.add("active");

      } catch (err) {
        verifyGeneralError.textContent = err.message;
        verifyGeneralError.style.display = "block";
      } finally {
        btnVerify.disabled = false;
        btnVerify.textContent = "Verify Order";
      }
    });

    function renderOrderItems(items) {
      itemsContainer.innerHTML = "";
      
      if (!items || items.length === 0) {
        itemsContainer.innerHTML = "<p style='font-size: 14px; color: #888;'>No returnable items found in this order.</p>";
        return;
      }

      items.forEach(item => {
        const row = document.createElement("div");
        row.className = "eu-withdrawal-item-row";
        
        row.innerHTML = `
          <input type="checkbox" class="eu-withdrawal-item-check" data-id="${item.id}" data-title="${encodeURIComponent(item.title)}" data-qty="${item.quantity}" checked>
          <div class="eu-withdrawal-item-info">
            <div class="eu-withdrawal-item-title">${item.title}</div>
            <div class="eu-withdrawal-item-meta">${item.variantTitle ? item.variantTitle : ''}</div>
          </div>
          <div class="eu-withdrawal-item-qty">Qty: ${item.quantity}</div>
        `;
        itemsContainer.appendChild(row);
      });
    }

    btnConfirm.addEventListener("click", async function() {
      const checkedBoxes = itemsContainer.querySelectorAll(".eu-withdrawal-item-check:checked");
      
      if (checkedBoxes.length === 0) {
        submitGeneralError.textContent = "Please select at least one item to withdraw.";
        submitGeneralError.style.display = "block";
        return;
      }

      submitGeneralError.style.display = "none";
      btnConfirm.disabled = true;
      btnConfirm.textContent = "Submitting...";

      const selectedItems = [];
      checkedBoxes.forEach(box => {
        selectedItems.push({
          id: box.getAttribute("data-id"),
          title: decodeURIComponent(box.getAttribute("data-title")),
          quantity: parseInt(box.getAttribute("data-qty"), 10)
        });
      });

      try {
        const response = await fetch(`${proxyPath}/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderId: orderDetails.id,
            orderName: orderDetails.name,
            email: inputEmail.value.trim(),
            shop: shop,
            selectedItems: selectedItems
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "Failed to submit withdrawal request.");
        }

        refIdSpan.textContent = result.referenceId;
        step2.classList.remove("active");
        step3.classList.add("active");

      } catch (err) {
        submitGeneralError.textContent = err.message;
        submitGeneralError.style.display = "block";
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = "Confirm Withdrawal";
      }
    });

  });
})();
