const Auth = require("../src/auth");

describe("AuthCore", () => {
  describe("validateRegistration", () => {
    it("should normalize valid email and Mexican phone number", () => {
      const result = Auth.validateRegistration({
        email: " USUARIO@Correo.COM ",
        phone: "55 1234 5678",
        termsAccepted: true
      });

      expect(result.isValid).toBe(true);
      expect(result.normalized).toEqual({
        email: "usuario@correo.com",
        phoneE164: "525512345678",
        phoneDisplay: "+525512345678"
      });
    });

    it("should return field errors for invalid registration data", () => {
      const result = Auth.validateRegistration({
        email: "correo-invalido",
        phone: "123",
        termsAccepted: false
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveProperty("email");
      expect(result.errors).toHaveProperty("phone");
      expect(result.errors).toHaveProperty("termsAccepted");
    });
  });

  describe("validatePhoneAccess", () => {
    it("should validate a phone-only access request", () => {
      const result = Auth.validatePhoneAccess({
        phone: "722 148 4739"
      });

      expect(result.isValid).toBe(true);
      expect(result.normalized).toEqual({
        email: "",
        phoneE164: "527221484739",
        phoneDisplay: "+527221484739"
      });
    });
  });

  describe("generateVerificationCode", () => {
    it("should create a six digit code", () => {
      expect(Auth.generateVerificationCode(() => 0.42)).toBe("420000");
      expect(Auth.generateVerificationCode(() => 0.00001)).toBe("000010");
    });
  });

  describe("parseExternalLoginParams", () => {
    it("should parse Param1 as the redirected phone number", () => {
      const result = Auth.parseExternalLoginParams(
        "?Param1=7221484739"
      );

      expect(result.hasParams).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.normalized).toEqual({
        email: "",
        phoneE164: "527221484739",
        phoneDisplay: "+527221484739"
      });
    });

    it("should be invalid when redirected parameters are malformed", () => {
      const result = Auth.parseExternalLoginParams("?Param1=123");

      expect(result.hasParams).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveProperty("phone");
    });

    it("should ignore URLs without redirected login parameters", () => {
      const result = Auth.parseExternalLoginParams("?wa=525512345678");

      expect(result.hasParams).toBe(false);
      expect(result.isValid).toBe(false);
    });
  });

  describe("verifyCode", () => {
    const baseUser = {
      email: "usuario@correo.com",
      phoneE164: "525512345678",
      phoneDisplay: "+525512345678"
    };

    it("should verify a valid code before expiration", () => {
      const session = Auth.createVerificationSession(baseUser, {
        now: 1000,
        code: "123456"
      });

      const result = Auth.verifyCode(session, "123456", { now: 2000 });

      expect(result.ok).toBe(true);
      expect(result.reason).toBe("verified");
      expect(result.session.status).toBe("verified");
      expect(result.session.verifiedAt).toBe(2000);
    });

    it("should reject an expired session", () => {
      const session = Auth.createVerificationSession(baseUser, {
        now: 1000,
        code: "123456",
        ttlMinutes: 1
      });

      const result = Auth.verifyCode(session, "123456", { now: 62001 });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe("expired");
      expect(result.session.status).toBe("expired");
    });

    it("should block after the configured maximum attempts", () => {
      const session = Auth.createVerificationSession(baseUser, {
        now: 1000,
        code: "123456",
        maxAttempts: 2
      });

      const firstTry = Auth.verifyCode(session, "000000", { now: 2000 });
      const secondTry = Auth.verifyCode(firstTry.session, "111111", { now: 3000 });

      expect(firstTry.reason).toBe("invalid_code");
      expect(secondTry.reason).toBe("blocked");
      expect(secondTry.session.status).toBe("blocked");
      expect(secondTry.remainingAttempts).toBe(0);
    });
  });

  describe("buildWhatsAppAuthorizationUrl", () => {
    it("should not build a WhatsApp URL when no receiver phone is configured", () => {
      const url = Auth.buildWhatsAppAuthorizationUrl({
        code: "654321",
        email: "usuario@correo.com",
        userPhone: "525512345678"
      });

      expect(url).toBe("");
    });

    it("should build a direct WhatsApp URL when a business phone is configured", () => {
      const url = Auth.buildWhatsAppAuthorizationUrl({
        businessPhone: "+52 55 0000 0000",
        code: "654321",
        email: "usuario@correo.com",
        userPhone: "525512345678"
      });

      expect(url).toMatch(/^https:\/\/api\.whatsapp\.com\/send\?phone=525500000000&text=/);
      expect(decodeURIComponent(url)).toContain("AUTORIZAR 654321");
      expect(decodeURIComponent(url)).toContain("usuario@correo.com");
    });

    it("should normalize a ten digit receiver phone before building the URL", () => {
      const url = Auth.buildWhatsAppAuthorizationUrl({
        businessPhone: "729 251 2286",
        code: "654321",
        email: "usuario@correo.com",
        userPhone: "527292512286"
      });

      expect(url).toMatch(/^https:\/\/api\.whatsapp\.com\/send\?phone=527292512286&text=/);
    });
  });
});
