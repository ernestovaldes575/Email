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
    const encode = value => Buffer.from(value, "utf8").toString("base64");
    const portalQuery = value => `?Param1=${encodeURIComponent(encode(value))}`;

    it("should decode the supplied URL and remove its UTF-8 BOM", () => {
      const result = Auth.parseExternalLoginParams(
        "https://simga.com.mx/Confirmacion/index.html?Param1=77u/MzR8UG9ydGFsU2VyUHViX1NlclB1YlZhbDAyLmFzcHwxMDV8NzIyMTQ4NDczOXw="
      );

      expect(result.isValid).toBe(true);
      expect(result.requiresPhone).toBe(false);
      expect(result.decodedParam1).toBe("34|PortalSerPub_SerPubVal02.asp|105|7221484739|");
      expect(result.normalized.phoneE164).toBe("527221484739");
      expect(result.normalized.portal).toEqual({
        ipOctet: "34",
        path: "PortalSerPub/SerPubVal02.asp",
        fields: ["105", "7221484739", ""]
      });
    });

    it.each(["", "   "])("should request phone registration for an empty phone field (%j)", phone => {
      const result = Auth.parseExternalLoginParams(portalQuery(`34|PortalSerPub_SerPubVal02.asp|105|${phone}|`));

      expect(result.isValid).toBe(true);
      expect(result.requiresPhone).toBe(true);
      expect(result.normalized.phoneE164).toBeUndefined();
      expect(result.normalized.portal.fields[0]).toBe("105");
    });

    it("should not read a later data field as the missing phone", () => {
      const result = Auth.parseExternalLoginParams(portalQuery("34|PortalSerPub_SerPubVal02.asp|105||1234567890|"));

      expect(result.requiresPhone).toBe(true);
      expect(result.normalized.portal.fields).toEqual(["105", "", "1234567890", ""]);
    });

    it("should accept raw and URL-encoded Base64 plus signs without accepting encoded spaces", () => {
      const encoded = encode("34|PortalSerPub_SerPubVal02.asp|105|7221484739|>>>");
      expect(encoded).toContain("+");
      expect(Auth.parseExternalLoginParams(`?Param1=${encoded}`).isValid).toBe(true);
      expect(Auth.parseExternalLoginParams(`?Param1=${encodeURIComponent(encoded)}`).isValid).toBe(true);
      expect(Auth.parseExternalLoginParams(`?Param1=${encoded.replace(/\+/g, "%20")}`).isValid).toBe(false);
    });

    it.each([
      "256|PortalSerPub_SerPubVal02.asp|105|7221484739|",
      "34|PortalSerPub/../SerPubVal02.asp|105|7221484739|",
      "34|https://otro.example/portal.asp|105|7221484739|",
      "34|PortalSerPub/%2e%2e/portal.asp|105|7221484739|",
      "34|PortalSerPub_SerPubVal02.asp||7221484739|",
      "34|PortalSerPub_SerPubVal02.asp|105|abc7221484739|",
      "34|PortalSerPub_SerPubVal02.asp|105|123|",
      "34|PortalSerPub_SerPubVal02.asp|105"
    ])("should reject a malformed portal payload: %s", payload => {
      const result = Auth.parseExternalLoginParams(portalQuery(payload));
      expect(result.isValid).toBe(false);
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    });

    it.each(["AB==", "/w==", "not-base64!"])("should reject invalid Base64 or UTF-8: %s", param1 => {
      const result = Auth.parseExternalLoginParams(`?Param1=${encodeURIComponent(param1)}`);
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveProperty("param1");
    });

    it("should reject duplicate Param1 even when letter case differs", () => {
      const result = Auth.parseExternalLoginParams("?Param1=7221484739&PARAM1=5512345678");
      expect(result.isValid).toBe(false);
      expect(result.errors.param1).toContain("duplicado");
    });

    it("should request manual registration for an empty Param1", () => {
      const result = Auth.parseExternalLoginParams("?Param1=");
      expect(result.isValid).toBe(true);
      expect(result.requiresPhone).toBe(true);
    });

    it("should parse Param1 as the redirected phone number", () => {
      const result = Auth.parseExternalLoginParams(
        "?Param1=7221484739"
      );

      expect(result.hasParams).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.normalized).toEqual({
        email: "",
        coordinates: "",
        phoneE164: "527221484739",
        phoneDisplay: "+527221484739"
      });
    });

    it("should parse Param2 as coordinates when present", () => {
      const result = Auth.parseExternalLoginParams(
        "?Param1=7221484739&Param2=19.4326,-99.1332"
      );

      expect(result.hasParams).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.normalized.coordinates).toBe("19.4326,-99.1332");
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

    it("should allow repeated attempts without blocking until expiration", () => {
      const session = Auth.createVerificationSession(baseUser, {
        now: 1000,
        code: "123456"
      });

      let lastTry = session;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const result = Auth.verifyCode(lastTry, "000000", { now: 2000 + attempt });
        expect(result.reason).toBe("invalid_code");
        expect(result.session.status).toBe("pending");
        lastTry = result.session;
      }

      const validTry = Auth.verifyCode(lastTry, "123456", { now: 3000 });
      expect(validTry.ok).toBe(true);
      expect(validTry.session.status).toBe("verified");
      expect(validTry.session.attempts).toBe(10);
    });

    it("should reactivate a non-expired session blocked by an older version", () => {
      const session = Auth.createVerificationSession(baseUser, {
        now: 1000,
        code: "123456"
      });
      session.status = "blocked";
      session.attempts = 3;

      const result = Auth.verifyCode(session, "123456", { now: 2000 });

      expect(result.ok).toBe(true);
      expect(result.session.status).toBe("verified");
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

  describe("buildPortalAccessUrl", () => {
    function parsePortal(payload) {
      return Auth.parseExternalLoginParams(`?Param1=${encodeURIComponent(Buffer.from(payload, "utf8").toString("base64"))}`);
    }

    it("should return key and phone as Base64 to the destination supplied by Param1", () => {
      const parsed = parsePortal("041|OtroPortal_Validar.aspx|105|7221484739|");
      const url = new URL(Auth.buildPortalAccessUrl({
        phone: parsed.normalized.phoneE164,
        portal: parsed.normalized.portal,
        includePhoneParam: true
      }));

      expect(url.origin).toBe("http://201.122.44.41");
      expect(url.pathname).toBe("/OtroPortal/Validar.aspx");
      expect(Buffer.from(url.searchParams.get("Param1"), "base64").toString("utf8")).toBe("|105|7221484739|");
    });

    it("should insert the manually registered phone and preserve extra fields and separators", () => {
      const parsed = parsePortal("34|PortalSerPub_SerPubVal02.asp|105||año||dato-final||");
      const session = Auth.createVerificationSession({
        ...parsed.normalized,
        ...Auth.normalizePhone("55 1234 5678"),
        coordinates: "19.4326,-99.1332"
      });
      const url = new URL(Auth.buildPortalAccessUrl({
        phone: session.user.phoneE164,
        portal: session.user.portal,
        coordinates: session.user.coordinates,
        includePhoneParam: true
      }));

      expect(Buffer.from(url.searchParams.get("Param1"), "base64").toString("utf8"))
        .toBe("|105|5512345678|año||dato-final||");
      expect(url.searchParams.get("Param2")).toBe("19.4326,-99.1332");
      expect(parsed.normalized.portal.fields[1]).toBe("");
      expect(session.user.portal.fields[1]).toBe("");
    });

    it("should add the final separator when the incoming payload does not have one", () => {
      const parsed = parsePortal("34|PortalSerPub_SerPubVal02.asp|105|7221484739");
      const url = new URL(Auth.buildPortalAccessUrl({
        phone: parsed.normalized.phoneE164,
        portal: parsed.normalized.portal,
        includePhoneParam: true
      }));
      expect(Buffer.from(url.searchParams.get("Param1"), "base64").toString("utf8")).toBe("|105|7221484739|");
    });

    it("should append Param1 even when the number came from redirected parameters", () => {
      const url = Auth.buildPortalAccessUrl({
        phone: "527221484739",
        includePhoneParam: true
      });

      expect(url).toBe("http://201.122.44.34/PortalSerPub/SerPubVal02.asp?Param1=7221484739");
    });

    it("should append Param1 with the local phone when the number was captured manually", () => {
      const url = Auth.buildPortalAccessUrl({
        phone: "527221484739",
        includePhoneParam: true
      });

      expect(url).toBe("http://201.122.44.34/PortalSerPub/SerPubVal02.asp?Param1=7221484739");
    });

    it("should append Param2 coordinates when provided", () => {
      const url = Auth.buildPortalAccessUrl({
        phone: "527221484739",
        coordinates: "19.4326,-99.1332",
        includePhoneParam: true
      });

      expect(url).toBe("http://201.122.44.34/PortalSerPub/SerPubVal02.asp?Param1=7221484739&Param2=19.4326%2C-99.1332");
    });
  });
});
