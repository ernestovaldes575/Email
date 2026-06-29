(function () {
  const Auth = window.AuthCore;
  const STORAGE_KEY = "whatsapp-login-demo:session";
  const runtimeConfig = window.WHATSAPP_LOGIN_CONFIG || {};

  const elements = {
    appShell: document.getElementById("appShell"),
    registrationForm: document.getElementById("registrationForm"),
    phone: document.getElementById("phone"),
    emptyState: document.getElementById("emptyState"),
    pendingState: document.getElementById("pendingState"),
    accessState: document.getElementById("accessState"),
    qrCode: document.getElementById("qrCode"),
    statusBadge: document.getElementById("statusBadge"),
    summaryPhone: document.getElementById("summaryPhone"),
    expiresIn: document.getElementById("expiresIn"),
    demoCodeBlock: document.getElementById("demoCodeBlock"),
    demoCode: document.getElementById("demoCode"),
    whatsappLink: document.getElementById("whatsappLink"),
    copyMessageButton: document.getElementById("copyMessageButton"),
    verificationForm: document.getElementById("verificationForm"),
    verificationCode: document.getElementById("verificationCode"),
    verificationFeedback: document.getElementById("verificationFeedback"),
    resendButton: document.getElementById("resendButton"),
    accessPhone: document.getElementById("accessPhone"),
    accessTime: document.getElementById("accessTime"),
    portalLink: document.getElementById("portalLink")
  };

  const externalLogin = Auth.parseExternalLoginParams(window.location.search);
  let currentSession = null;
  let countdownTimer = null;

  currentSession = initializeSession();

  function getSessionKey(user) {
    return user.phoneE164;
  }

  function initializeSession() {
    const storedSession = loadSession();

    if (!externalLogin.hasParams) {
      return null;
    }

    if (!externalLogin.isValid) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const paramKey = getSessionKey(externalLogin.normalized);
    const canReuseStoredSession =
      storedSession &&
      storedSession.source === "external-login" &&
      storedSession.paramKey === paramKey &&
      !Auth.isExpired(storedSession);

    if (canReuseStoredSession) {
      return storedSession;
    }

    const session = Auth.createVerificationSession(externalLogin.normalized);
    session.source = "external-login";
    session.paramKey = paramKey;
    saveSession(session);
    return session;
  }

  function applyStartupMode() {
    if (!externalLogin.hasParams) {
      return;
    }

    elements.registrationForm.classList.add("hidden");
    elements.resendButton.classList.add("hidden");
    elements.appShell.classList.add("authorization-only");

    if (externalLogin.isValid) {
      elements.phone.value = externalLogin.normalized.phoneDisplay;
    }
  }

  function getQueryReceiverPhone() {
    const queryParams = new URLSearchParams(window.location.search);
    return Auth.sanitizeDigits(queryParams.get("wa"));
  }

  function getReceiverPhoneForSession(session) {
    const queryPhone = getQueryReceiverPhone();

    if (queryPhone) {
      return queryPhone;
    }

    if (runtimeConfig.receiverMode === "fixed") {
      return Auth.sanitizeDigits(runtimeConfig.authorizationReceiverPhone || runtimeConfig.whatsappBusinessPhone || "");
    }

    return session && session.user ? session.user.phoneE164 : "";
  }

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

    [elements.phone].forEach((input) => {
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
    return session;
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
      businessPhone: getReceiverPhoneForSession(session),
      code: session.code,
      email: session.user.email,
      userPhone: session.user.phoneE164
    };
  }

  function renderQrCode(url) {
    elements.qrCode.innerHTML = "";

    if (!url) {
      elements.qrCode.innerHTML = '<div class="px-3 text-center text-sm font-medium text-slate-500">Falta numero destino</div>';
      return;
    }

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

  function setPendingAvailability(isAvailable, hasReceiverPhone) {
    elements.verificationCode.disabled = !isAvailable;
    elements.whatsappLink.setAttribute("aria-disabled", String(!isAvailable || !hasReceiverPhone));
    elements.whatsappLink.classList.toggle("pointer-events-none", !isAvailable || !hasReceiverPhone);
    elements.copyMessageButton.disabled = !isAvailable;
  }

  function renderEmpty() {
    setVisible(elements.emptyState, true);
    setVisible(elements.pendingState, false);
    setVisible(elements.accessState, false);
    stopCountdown();

    if (externalLogin.hasParams && !externalLogin.isValid) {
      const title = elements.emptyState.querySelector("h2");
      const copy = elements.emptyState.querySelector("p");

      if (title) {
        title.textContent = "Parametros invalidos";
      }

      if (copy) {
        copy.textContent = "Param1 debe ser un telefono valido.";
      }
    }
  }

  function renderPending(session) {
    const expired = session.status === "expired" || Auth.isExpired(session);
    const blocked = session.status === "blocked";
    const available = !expired && !blocked;
    const receiverPhone = getReceiverPhoneForSession(session);
    const authUrl = Auth.buildWhatsAppAuthorizationUrl(getAuthorizationPayload(session));
    const hasReceiverPhone = Boolean(receiverPhone);

    setVisible(elements.emptyState, false);
    setVisible(elements.pendingState, true);
    setVisible(elements.accessState, false);

    elements.summaryPhone.textContent = session.user.phoneDisplay;
    if (elements.demoCode) {
      elements.demoCode.textContent = "";
    }
    elements.whatsappLink.href = authUrl || "#";
    elements.verificationFeedback.textContent = blocked
      ? "Se agotaron los intentos. Genera un nuevo código."
      : expired
        ? "El código expiró. Genera uno nuevo para continuar."
        : hasReceiverPhone
          ? `Intentos disponibles: ${session.maxAttempts - session.attempts}`
          : "Captura un telefono valido para abrir un chat directo.";

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

    setPendingAvailability(available, hasReceiverPhone);
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

    elements.accessPhone.textContent = session.user.phoneDisplay;
    elements.accessTime.textContent = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(session.verifiedAt || Date.now()));
    elements.portalLink.href = Auth.buildPortalAccessUrl({
      phone: session.user.phoneE164,
      includePhoneParam: true
    });
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

    const result = Auth.validatePhoneAccess({
      phone: elements.phone.value
    });

    if (!result.isValid) {
      showFieldErrors(result.errors);
      return;
    }

    clearFieldErrors();
    const session = Auth.createVerificationSession(result.normalized);
    session.source = "manual";
    session.paramKey = getSessionKey(result.normalized);
    saveSession(session);
    elements.verificationCode.value = "";
    render();
    notify("Validación creada", "Abre WhatsApp y envía el mensaje de autorización.", "success");
  }

  async function handleVerificationSubmit(event) {
    event.preventDefault();

    if (!currentSession) {
      return;
    }

    const result = Auth.verifyCode(currentSession, elements.verificationCode.value);
    saveSession(result.session);

    if (result.ok) {
      const savedAccess = await saveAuthorizedAccess(result.session);
      elements.verificationCode.value = "";
      saveSession({
        ...result.session,
        accessSaved: savedAccess.ok
      });
      render();
      notify(
        "Acceso autorizado",
        savedAccess.ok ? "Numero guardado en JSON." : "Acceso autorizado. No se pudo guardar en JSON desde este servidor.",
        savedAccess.ok ? "success" : "warning"
      );
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

  async function saveAuthorizedAccess(session) {
    const payload = {
      phone: session.user.phoneE164,
      phoneDisplay: session.user.phoneDisplay,
      authorizedAt: new Date(session.verifiedAt || Date.now()).toISOString(),
      source: session.source || "manual"
    };

    try {
      const response = await fetch("guardar-acceso.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("SAVE_FAILED");
      }

      return { ok: true };
    } catch (error) {
      localStorage.setItem("whatsapp-login-demo:last-access", JSON.stringify(payload));
      return { ok: false, error };
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

  applyStartupMode();

  elements.registrationForm.addEventListener("submit", handleRegistrationSubmit);
  elements.verificationForm.addEventListener("submit", handleVerificationSubmit);
  elements.copyMessageButton.addEventListener("click", handleCopyMessage);
  elements.resendButton.addEventListener("click", handleResend);

  if (window.lucide) {
    window.lucide.createIcons();
  }

  render();
})();
