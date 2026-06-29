(function () {
  const Auth = window.AuthCore;
  const STORAGE_KEY = "whatsapp-login-demo:session";
  const APP_CONFIG = {
    whatsappBusinessPhone: ""
  };

  const elements = {
    registrationForm: document.getElementById("registrationForm"),
    email: document.getElementById("email"),
    phone: document.getElementById("phone"),
    termsAccepted: document.getElementById("termsAccepted"),
    emptyState: document.getElementById("emptyState"),
    pendingState: document.getElementById("pendingState"),
    accessState: document.getElementById("accessState"),
    qrCode: document.getElementById("qrCode"),
    statusBadge: document.getElementById("statusBadge"),
    summaryEmail: document.getElementById("summaryEmail"),
    summaryPhone: document.getElementById("summaryPhone"),
    expiresIn: document.getElementById("expiresIn"),
    demoCode: document.getElementById("demoCode"),
    whatsappLink: document.getElementById("whatsappLink"),
    copyMessageButton: document.getElementById("copyMessageButton"),
    verificationForm: document.getElementById("verificationForm"),
    verificationCode: document.getElementById("verificationCode"),
    verificationFeedback: document.getElementById("verificationFeedback"),
    resendButton: document.getElementById("resendButton"),
    accessEmail: document.getElementById("accessEmail"),
    accessPhone: document.getElementById("accessPhone"),
    accessTime: document.getElementById("accessTime"),
    logoutButton: document.getElementById("logoutButton")
  };

  let currentSession = loadSession();
  let countdownTimer = null;

  function setVisible(element, isVisible) {
    element.classList.toggle("hidden", !isVisible);
  }

  function notify(title, text, icon) {
    if (window.Swal) {
      window.Swal.fire({
        title,
        text,
        icon,
        confirmButtonColor: "#128c7e"
      });
      return;
    }

    window.alert(`${title}\n${text}`);
  }

  function clearFieldErrors() {
    document.querySelectorAll("[data-error-for]").forEach((node) => {
      node.textContent = "";
    });

    [elements.email, elements.phone].forEach((input) => {
      input.classList.remove("is-invalid");
    });
  }

  function showFieldErrors(errors) {
    clearFieldErrors();

    Object.entries(errors).forEach(([field, message]) => {
      const errorNode = document.querySelector(`[data-error-for="${field}"]`);
      if (errorNode) {
        errorNode.textContent = message;
      }

      const input = elements[field];
      if (input && input.classList) {
        input.classList.add("is-invalid");
      }
    });
  }

  function saveSession(session) {
    currentSession = session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function loadSession() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  function clearSession() {
    currentSession = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  function getAuthorizationPayload(session) {
    return {
      businessPhone: APP_CONFIG.whatsappBusinessPhone,
      code: session.code,
      email: session.user.email,
      userPhone: session.user.phoneE164
    };
  }

  function renderQrCode(url) {
    elements.qrCode.innerHTML = "";

    if (!window.QRCode) {
      elements.qrCode.textContent = "QR";
      return;
    }

    new window.QRCode(elements.qrCode, {
      text: url,
      width: 156,
      height: 156,
      colorDark: "#17212b",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M
    });
  }

  function updateCountdown() {
    if (!currentSession || currentSession.status !== "pending") {
      stopCountdown();
      return;
    }

    const remaining = currentSession.expiresAt - Date.now();
    elements.expiresIn.textContent = Auth.formatRemainingTime(remaining);

    if (remaining <= 0) {
      currentSession = { ...currentSession, status: "expired" };
      saveSession(currentSession);
      render();
    }
  }

  function startCountdown() {
    stopCountdown();
    updateCountdown();
    countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  function stopCountdown() {
    if (countdownTimer) {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function setPendingAvailability(isAvailable) {
    elements.verificationCode.disabled = !isAvailable;
    elements.whatsappLink.setAttribute("aria-disabled", String(!isAvailable));
    elements.whatsappLink.classList.toggle("pointer-events-none", !isAvailable);
    elements.copyMessageButton.disabled = !isAvailable;
  }

  function renderEmpty() {
    setVisible(elements.emptyState, true);
    setVisible(elements.pendingState, false);
    setVisible(elements.accessState, false);
    stopCountdown();
  }

  function renderPending(session) {
    const expired = session.status === "expired" || Auth.isExpired(session);
    const blocked = session.status === "blocked";
    const available = !expired && !blocked;
    const authUrl = Auth.buildWhatsAppAuthorizationUrl(getAuthorizationPayload(session));

    setVisible(elements.emptyState, false);
    setVisible(elements.pendingState, true);
    setVisible(elements.accessState, false);

    elements.summaryEmail.textContent = session.user.email;
    elements.summaryPhone.textContent = session.user.phoneDisplay;
    elements.demoCode.textContent = session.code;
    elements.whatsappLink.href = authUrl;
    elements.verificationFeedback.textContent = blocked
      ? "Se agotaron los intentos. Genera un nuevo código."
      : expired
        ? "El código expiró. Genera uno nuevo para continuar."
        : `Intentos disponibles: ${session.maxAttempts - session.attempts}`;

    elements.statusBadge.className = "inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-sm font-medium";
    if (blocked) {
      elements.statusBadge.classList.add("bg-red-100", "text-red-700");
      elements.statusBadge.innerHTML = '<span class="h-2 w-2 rounded-full bg-red-500"></span> Bloqueado';
    } else if (expired) {
      elements.statusBadge.classList.add("bg-slate-100", "text-slate-700");
      elements.statusBadge.innerHTML = '<span class="h-2 w-2 rounded-full bg-slate-500"></span> Expirado';
    } else {
      elements.statusBadge.classList.add("bg-amber-100", "text-amber-800");
      elements.statusBadge.innerHTML = '<span class="h-2 w-2 rounded-full bg-amber-500"></span> Pendiente';
    }

    setPendingAvailability(available);
    renderQrCode(authUrl);

    if (available) {
      startCountdown();
    } else {
      stopCountdown();
      elements.expiresIn.textContent = "00:00";
    }
  }

  function renderAccess(session) {
    setVisible(elements.emptyState, false);
    setVisible(elements.pendingState, false);
    setVisible(elements.accessState, true);
    stopCountdown();

    elements.accessEmail.textContent = session.user.email;
    elements.accessPhone.textContent = session.user.phoneDisplay;
    elements.accessTime.textContent = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(session.verifiedAt || Date.now()));
  }

  function render() {
    if (!currentSession) {
      renderEmpty();
      return;
    }

    if (currentSession.status === "verified") {
      renderAccess(currentSession);
      return;
    }

    renderPending(currentSession);

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function handleRegistrationSubmit(event) {
    event.preventDefault();

    const result = Auth.validateRegistration({
      email: elements.email.value,
      phone: elements.phone.value,
      termsAccepted: elements.termsAccepted.checked
    });

    if (!result.isValid) {
      showFieldErrors(result.errors);
      return;
    }

    clearFieldErrors();
    const session = Auth.createVerificationSession(result.normalized);
    saveSession(session);
    elements.verificationCode.value = "";
    render();
    notify("Validación creada", "Abre WhatsApp y envía el mensaje de autorización.", "success");
  }

  function handleVerificationSubmit(event) {
    event.preventDefault();

    if (!currentSession) {
      return;
    }

    const result = Auth.verifyCode(currentSession, elements.verificationCode.value);
    saveSession(result.session);

    if (result.ok) {
      elements.verificationCode.value = "";
      render();
      notify("Acceso autorizado", "La sesión quedó activa.", "success");
      return;
    }

    render();

    if (result.reason === "invalid_code") {
      elements.verificationFeedback.textContent = `Código incorrecto. Intentos disponibles: ${result.remainingAttempts}`;
      return;
    }

    if (result.reason === "expired") {
      notify("Código expirado", "Genera un nuevo código para continuar.", "warning");
      return;
    }

    if (result.reason === "blocked") {
      notify("Validación bloqueada", "Se agotaron los intentos disponibles.", "error");
    }
  }

  async function handleCopyMessage() {
    if (!currentSession) {
      return;
    }

    const message = Auth.buildAuthorizationMessage(getAuthorizationPayload(currentSession));

    try {
      await navigator.clipboard.writeText(message);
      notify("Mensaje copiado", "Pégalo en WhatsApp para autorizar.", "success");
    } catch (error) {
      notify("No se pudo copiar", message, "info");
    }
  }

  function handleResend() {
    if (!currentSession) {
      return;
    }

    const nextSession = Auth.createVerificationSession(currentSession.user);
    saveSession(nextSession);
    elements.verificationCode.value = "";
    render();
    notify("Nuevo código generado", "El código anterior ya no debe usarse.", "success");
  }

  function handleLogout() {
    clearSession();
    elements.registrationForm.reset();
    elements.verificationCode.value = "";
    render();
  }

  elements.registrationForm.addEventListener("submit", handleRegistrationSubmit);
  elements.verificationForm.addEventListener("submit", handleVerificationSubmit);
  elements.copyMessageButton.addEventListener("click", handleCopyMessage);
  elements.resendButton.addEventListener("click", handleResend);
  elements.logoutButton.addEventListener("click", handleLogout);

  if (window.lucide) {
    window.lucide.createIcons();
  }

  render();
})();
