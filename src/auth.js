(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AuthCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_COUNTRY_CODE = "52";
  const DEFAULT_TTL_MINUTES = 5;
  const DEFAULT_MAX_ATTEMPTS = 3;

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  function sanitizeDigits(value) {
    const raw = String(value || "").trim();
    const withoutInternationalPrefix = raw.replace(/^00/, "");
    return withoutInternationalPrefix.replace(/\D/g, "");
  }

  function normalizePhone(phone, countryCode = DEFAULT_COUNTRY_CODE) {
    let digits = sanitizeDigits(phone);
    const cleanCountryCode = sanitizeDigits(countryCode) || DEFAULT_COUNTRY_CODE;

    if (digits.length === 10) {
      digits = `${cleanCountryCode}${digits}`;
    }

    if (digits.length < 10 || digits.length > 15) {
      throw new Error("PHONE_INVALID_LENGTH");
    }

    return {
      phoneE164: digits,
      phoneDisplay: `+${digits}`
    };
  }

  function validateRegistration(values) {
    const input = values || {};
    const email = normalizeEmail(input.email);
    const errors = {};
    const normalized = { email };

    if (!isValidEmail(email)) {
      errors.email = "Escribe un correo electrónico válido.";
    }

    try {
      Object.assign(normalized, normalizePhone(input.phone, input.countryCode));
    } catch (error) {
      errors.phone = "Escribe un teléfono válido con 10 a 15 dígitos.";
    }

    if (!input.termsAccepted) {
      errors.termsAccepted = "Debes autorizar la asociación de datos para continuar.";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      normalized
    };
  }

  function validatePhoneAccess(values) {
    const input = values || {};
    const errors = {};
    const normalized = { email: "" };

    try {
      Object.assign(normalized, normalizePhone(input.phone, input.countryCode));
    } catch (error) {
      errors.phone = "Escribe un telefono valido con 10 a 15 digitos.";
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      normalized
    };
  }

  function getQueryParamCaseInsensitive(params, name) {
    const expected = String(name).toLowerCase();

    for (const [key, value] of params.entries()) {
      if (String(key).toLowerCase() === expected) {
        return value;
      }
    }

    return "";
  }

  function parseExternalLoginParams(search) {
    const params = search instanceof URLSearchParams
      ? search
      : new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const phone = getQueryParamCaseInsensitive(params, "Param1");

    if (!phone) {
      return {
        hasParams: false,
        isValid: false,
        errors: {},
        normalized: {}
      };
    }

    const result = validatePhoneAccess({ phone });

    return {
      hasParams: true,
      isValid: result.isValid,
      errors: result.errors,
      normalized: result.normalized
    };
  }

  function generateVerificationCode(random = Math.random) {
    const value = Math.floor(random() * 1000000);
    return String(value).padStart(6, "0");
  }

  function createVerificationSession(user, options) {
    const opts = options || {};
    const now = Number(opts.now ?? Date.now());
    const ttlMinutes = Number(opts.ttlMinutes ?? DEFAULT_TTL_MINUTES);
    const random = opts.random || Math.random;
    const code = opts.code || generateVerificationCode(random);

    return {
      id: `wa_${now}_${code}`,
      user: {
        email: user.email || "",
        phoneE164: user.phoneE164,
        phoneDisplay: user.phoneDisplay
      },
      code,
      status: "pending",
      attempts: 0,
      maxAttempts: Number(opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
      createdAt: now,
      expiresAt: now + ttlMinutes * 60 * 1000
    };
  }

  function isExpired(session, now = Date.now()) {
    return Number(now) > Number(session.expiresAt);
  }

  function verifyCode(session, codeInput, options) {
    const opts = options || {};
    const now = Number(opts.now ?? Date.now());
    const nextSession = {
      ...session,
      user: { ...session.user }
    };
    const maxAttempts = Number(opts.maxAttempts ?? nextSession.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);

    if (nextSession.status === "verified") {
      return {
        ok: true,
        reason: "already_verified",
        remainingAttempts: Math.max(maxAttempts - nextSession.attempts, 0),
        session: nextSession
      };
    }

    if (isExpired(nextSession, now)) {
      nextSession.status = "expired";
      return {
        ok: false,
        reason: "expired",
        remainingAttempts: Math.max(maxAttempts - nextSession.attempts, 0),
        session: nextSession
      };
    }

    if (nextSession.status === "blocked" || nextSession.attempts >= maxAttempts) {
      nextSession.status = "blocked";
      return {
        ok: false,
        reason: "blocked",
        remainingAttempts: 0,
        session: nextSession
      };
    }

    const normalizedInput = sanitizeDigits(codeInput);

    if (normalizedInput === nextSession.code) {
      nextSession.status = "verified";
      nextSession.verifiedAt = now;
      return {
        ok: true,
        reason: "verified",
        remainingAttempts: Math.max(maxAttempts - nextSession.attempts, 0),
        session: nextSession
      };
    }

    nextSession.attempts += 1;

    if (nextSession.attempts >= maxAttempts) {
      nextSession.status = "blocked";
      return {
        ok: false,
        reason: "blocked",
        remainingAttempts: 0,
        session: nextSession
      };
    }

    return {
      ok: false,
      reason: "invalid_code",
      remainingAttempts: maxAttempts - nextSession.attempts,
      session: nextSession
    };
  }

  function buildAuthorizationMessage(values) {
    const data = values || {};
    const lines = [
      `AUTORIZAR ${data.code}`,
      `Telefono: +${sanitizeDigits(data.userPhone)}`
    ];

    if (data.email) {
      lines.splice(1, 0, `Correo: ${data.email}`);
    }

    return lines.join("\n");
  }

  function buildWhatsAppAuthorizationUrl(values) {
    const data = values || {};
    let businessPhone = "";

    try {
      businessPhone = normalizePhone(data.businessPhone).phoneE164;
    } catch (error) {
      businessPhone = "";
    }

    if (!businessPhone) {
      return "";
    }

    const message = buildAuthorizationMessage(data);
    return `https://api.whatsapp.com/send?phone=${businessPhone}&text=${encodeURIComponent(message)}`;
  }

  function formatRemainingTime(milliseconds) {
    const safeMs = Math.max(Number(milliseconds) || 0, 0);
    const totalSeconds = Math.ceil(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return {
    DEFAULT_COUNTRY_CODE,
    DEFAULT_TTL_MINUTES,
    DEFAULT_MAX_ATTEMPTS,
    normalizeEmail,
    isValidEmail,
    sanitizeDigits,
    normalizePhone,
    validateRegistration,
    validatePhoneAccess,
    parseExternalLoginParams,
    generateVerificationCode,
    createVerificationSession,
    isExpired,
    verifyCode,
    buildAuthorizationMessage,
    buildWhatsAppAuthorizationUrl,
    formatRemainingTime
  };
});
